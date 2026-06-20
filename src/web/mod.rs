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
use routes::sse;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::broadcast;
use tokio_stream::StreamExt;
use tower_http::cors::CorsLayer;

async fn health_check() -> &'static str {
    "OK"
}

pub async fn start_web_server(
    pool: sqlx::PgPool,
    http: Arc<poise::serenity_prelude::Http>,
    redis_client: redis::Client,
    guild_configs: moka::future::Cache<i64, GuildSettings>,
    tx: broadcast::Sender<LogEvent>,
) -> Result<(), Error> {
    let tx_clone = tx.clone();

    let redis_sub_client = redis_client.clone();

    tokio::spawn(async move {
        loop {
            match redis_sub_client.get_async_pubsub().await {
                Ok(mut pubsub) => {
                    if let Err(e) = pubsub.subscribe(LogEvent::REDIS_CHANNELS).await {
                        eprintln!("Failed to subscribe to Redis: {}", e);
                        tokio::time::sleep(Duration::from_secs(5)).await;
                        continue;
                    }
                    println!("Subscribed to Redis channels: {:?}", LogEvent::REDIS_CHANNELS);

                    let mut stream = pubsub.on_message();
                    while let Some(msg) = stream.next().await {
                        let mut channel = msg.get_channel_name().to_string();
                        if let Ok(payload_str) = msg.get_payload::<String>() {
                            if let Some(event) = LogEvent::from_redis(&mut channel, &payload_str) {
                                let _ = tx_clone.send(event);
                            }
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Redis PubSub connection failed: {}. Retrying in 5s...", e);
                    tokio::time::sleep(Duration::from_secs(5)).await;
                }
            }
        }
    });

    let cors = CorsLayer::new()
        .allow_origin("http://localhost:3000".parse::<HeaderValue>()?)
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([axum::http::header::CONTENT_TYPE]);

    // Now redis_client remains owned by the outer scope and can be safely moved here
    let shared_state = Arc::new(WebState {
        tx,
        pool,
        http,
        redis_client,
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