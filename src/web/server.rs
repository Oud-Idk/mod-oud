use crate::core::config::settings::GuildSettings;
use crate::core::config::state::Error;
use crate::core::config::state::WebState;
use crate::core::config::state::{AppConfig, CoreServices};
use crate::features::live_feed;
use crate::features::live_feed::LogEvent;
use crate::web::router::get_router;
use axum::http::{HeaderValue, Method};
use fred::clients::SubscriberClient;
use fred::prelude::*;
use moka::future::Cache;
use serenity::all::Http;
use std::env;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::broadcast;
use tower_http::cors::CorsLayer;
use tracing::{error, info, instrument};
use crate::features::music::MusicState;
use crate::features::music::web_command::WebCommandBus;

#[instrument(skip(
    db,
    http,
    redis_client,
    subscriber_client,
    guild_configs,
    tx,
    web_commands,
    music_state
))]
pub async fn start_web_server(
    db: sqlx::PgPool,
    http: Arc<Http>,
    redis_client: Client,
    subscriber_client: SubscriberClient,
    guild_configs: Cache<u64, GuildSettings>,
    tx: broadcast::Sender<LogEvent>,
    reqwest_client: reqwest::Client,
    username_tx: tokio::sync::mpsc::Sender<crate::shared::username_cache::UserUpdate>,
    web_commands: WebCommandBus,
    music_state: MusicState,
) -> Result<(), Error> {
    if let Err(e) = live_feed::start_live_feed_subscriber(subscriber_client, tx.clone()).await {
        error!(error = ?e, "Failed to start live feed subscriber");
    }

    let cors = CorsLayer::new()
        .allow_origin("http://localhost:3000".parse::<HeaderValue>()?)
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([axum::http::header::CONTENT_TYPE]);

    let shared_state = Arc::new(WebState {
        core: CoreServices {
            db,
            redis: redis_client,
            reqwest_client,
            guild_configs_cache: guild_configs,
            username_tx,
            config: AppConfig::from_env(),
        },
        serenity_http: http,
        message_event_tx: tx,
        web_commands,
        music_state: music_state.clone(), // <--- WORKS NOW
    });

    let app = get_router(cors, shared_state);

    let port: u16 = env::var("PORT")
        .unwrap_or_else(|_| "8080".to_string())
        .parse()
        .unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));

    let listener = tokio::net::TcpListener::bind(addr).await?;
    info!(address = %addr, "TCP listener bound");

    tokio::spawn(async move {
        info!("Web server task started");
        if let Err(e) = axum::serve(listener, app).await {
            error!(error = %e, "Web server encountered a fatal runtime error");
        }
    });

    Ok(())
}