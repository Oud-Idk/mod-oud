pub mod routes;

use crate::types::config::config::GuildSettings;
use crate::types::{Error, LogEvent};
use crate::web::routes::commands::commands::handle_dashboard_command;
use crate::web::routes::tickets_delete::handle_delete_ticket_message;
use crate::web::routes::tickets_send::handle_send_ticket_message;
use crate::WebState;
use axum::http::{HeaderValue, Method};
use axum::routing::method_routing::get;
use axum::routing::Router;
use fred::clients::SubscriberClient;
use fred::prelude::*;
use routes::sse;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::broadcast;
use tower_http::cors::CorsLayer;

async fn health_check() -> &'static str {
    "OK"
}

pub async fn start_web_server(
    pool: sqlx::PgPool,
    http: Arc<poise::serenity_prelude::Http>,
    redis_client: Client,
    subscriber_client: SubscriberClient,
    guild_configs: moka::future::Cache<i64, GuildSettings>,
    tx: broadcast::Sender<LogEvent>,
) -> Result<(), Error> {
    let tx_clone = tx.clone();

    subscriber_client.on_message(move |msg| {
        let tx = tx_clone.clone();
        async move {
            let mut channel = msg.channel.to_string();
            let Ok(payload_str) = msg.value.convert::<String>() else {
                return Ok(());
            };
            if let Some(event) = LogEvent::from_redis(&mut channel, &payload_str) {
                let _ = tx.send(event);
            }
            Ok(())
        }
    });

    let channels: Vec<Key> = LogEvent::REDIS_CHANNELS
        .iter()
        .map(|&c| Key::from(c))
        .collect();

    if let Err(e) = subscriber_client.subscribe(channels).await {
        eprintln!("Failed to subscribe to Redis channels on startup: {:?}", e);
    } else {
        println!("Subscribed to Redis channels: {:?}", LogEvent::REDIS_CHANNELS);
    }

    let cors = CorsLayer::new()
        .allow_origin("http://localhost:3000".parse::<HeaderValue>()?)
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([axum::http::header::CONTENT_TYPE]);

    let shared_state = Arc::new(WebState {
        tx,
        pool,
        http,
        redis: redis_client,
        guild_configs,
    });

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/api/sse/events", get(sse::sse_handler))
        .route("/api/commands", axum::routing::post(handle_dashboard_command))
        .route(
            "/api/guilds/{guild_id}/tickets/send-message",
            axum::routing::post(handle_send_ticket_message)
        )
        .route(
            "/api/guilds/{guild_id}/tickets/delete-message",
            axum::routing::post(handle_delete_ticket_message)
        )
        .layer(cors)
        .with_state(shared_state);

    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "8080".to_string())
        .parse()
        .unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr).await?;

    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            eprintln!("Web server error: {}", e);
        }
    });

    Ok(())
}