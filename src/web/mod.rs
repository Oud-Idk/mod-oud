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
use tower_http::trace::TraceLayer;
use tracing::{debug, error, info, instrument, trace, warn};

#[instrument]
async fn health_check() -> &'static str {
    debug!("Health check endpoint called");
    "OK"
}

#[instrument(skip(pool, http, redis_client, subscriber_client, guild_configs, tx))]
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
                warn!(channel = %channel, "Failed to convert Redis message value to String");
                return Ok(());
            };

            debug!(
                channel = %channel,
                payload_len = payload_str.len(),
                "Received Redis subscription message"
            );

            if LogEvent::REDIS_CHANNELS.contains(&channel.as_str()) {
                if let Some(event) = LogEvent::from_redis(&mut channel, &payload_str) {
                    if let Err(e) = tx.send(event) {
                        error!(error = %e, "Failed to send LogEvent to broadcast channel");
                    }
                } else {
                    warn!(channel = %channel, "Failed to parse LogEvent from Redis payload");
                }
            } else {
                trace!(channel = %channel, "Received irrelevant payload; skipping");
            }
            Ok(())
        }
    });

    let channels: Vec<Key> = LogEvent::REDIS_CHANNELS
        .iter()
        .map(|&c| Key::from(c))
        .collect();

    info!(channels = ?LogEvent::REDIS_CHANNELS, "Subscribing to Redis channels...");
    if let Err(e) = subscriber_client.subscribe(channels).await {
        error!(error = ?e, "Failed to subscribe to Redis channels on startup");
    } else {
        info!("Successfully subscribed to Redis channels");
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
        .layer(TraceLayer::new_for_http())
        .with_state(shared_state);

    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "8080".to_string())
        .parse()
        .unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));

    info!(address = %addr, "Attempting to bind TCP listener");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    info!(address = %addr, "TCP listener bound successfully");

    tokio::spawn(async move {
        info!("Web server task started");
        if let Err(e) = axum::serve(listener, app).await {
            error!(error = %e, "Web server encountered a fatal runtime error");
        }
    });

    Ok(())
}