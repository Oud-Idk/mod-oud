use crate::core::config::settings::GuildSettings;
use crate::core::config::state::Error;
use crate::core::config::state::WebState;
use crate::core::config::state::{AppConfig, CoreServices};
use crate::features::live_feed;
use crate::features::live_feed::LogEvent;
use crate::features::music::MusicState;
use crate::features::music::WebCommandBus;
use crate::shared::username_cache::UserUpdate;
use crate::web::router::get_router;
use axum::http::{HeaderName, HeaderValue, Method};
use fred::clients::SubscriberClient;
use fred::prelude::*;
use moka::future::Cache;
use serenity::all::{GuildId, Http};
use std::env;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::broadcast;
use tower_http::cors::CorsLayer;
use tracing::{error, info, instrument};

/// Dependencies required to bootstrap the axum dashboard server.
pub struct WebServerDeps {
    /// `PostgreSQL` database connection pool managed by `SQLx`.
    pub db: sqlx::PgPool,
    /// Shared Serenity HTTP client for issuing Discord REST API requests.
    pub http: Arc<Http>,
    /// Redis client connection managed by `Fred`.
    pub redis_client: Client,
    /// Redis subscriber client for live log event streams.
    pub subscriber_client: SubscriberClient,
    /// In-memory cache for [`GuildSettings`], indexed by Discord guild ID.
    pub guild_configs: Cache<GuildId, GuildSettings>,
    /// Broadcast channel sender for pushing live log events to web clients.
    pub tx: broadcast::Sender<LogEvent>,
    /// Shared HTTP client for making external web requests.
    pub reqwest_client: reqwest::Client,
    /// Channel sender for queueing asynchronous username updates.
    pub username_tx: tokio::sync::mpsc::Sender<UserUpdate>,
    /// Event bus for receiving commands issued from the web dashboard.
    pub web_commands: WebCommandBus,
    /// Shared state manager for music player playback.
    pub music_state: MusicState,
}

/// Starts the axum dashboard server on the `PORT` env var (default 8080),
/// wiring up CORS, shared state, and the live-feed subscriber.
///
/// # Errors
/// Returns an error if the CORS origin fails to parse or the HTTP server fails
/// to bind and serve.
#[instrument(skip_all)]
pub async fn start_web_server(deps: WebServerDeps) -> Result<(), Error> {
    if let Err(e) =
        live_feed::start_live_feed_subscriber(deps.subscriber_client, deps.tx.clone()).await
    {
        error!(error = ?e, "Failed to start live feed subscriber");
    }

    // Comma-separated list of browser origins allowed to call this API
    // (e.g. `CORS_ORIGINS=https://dash.example.com,http://localhost:3000`).
    let cors_origins =
        std::env::var("CORS_ORIGINS").unwrap_or_else(|_| "http://localhost:3000".to_string());

    let origins = cors_origins
        .split(',')
        .map(|origin| {
            origin
                .trim()
                .trim_end_matches('/')
                .parse::<HeaderValue>()
                .map_err(Error::from)
        })
        .collect::<Result<Vec<_>, _>>()?;

    let cors = CorsLayer::new()
        .allow_origin(tower_http::cors::AllowOrigin::list(origins))
        .allow_methods([Method::GET, Method::POST, Method::DELETE])
        .allow_headers([
            axum::http::header::CONTENT_TYPE,
            axum::http::header::AUTHORIZATION,
            HeaderName::from_static("x-internal-secret"),
        ]);

    let shared_state = Arc::new(WebState {
        core: CoreServices {
            db: deps.db,
            redis: deps.redis_client,
            reqwest_client: deps.reqwest_client,
            guild_configs_cache: deps.guild_configs,
            username_tx: deps.username_tx,
            config: AppConfig::from_env(),
            spotify_auth: deps.music_state.spotify_auth.clone(),
        },
        serenity_http: deps.http,
        message_event_tx: deps.tx,
        web_commands: deps.web_commands,
        music_state: deps.music_state,
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
