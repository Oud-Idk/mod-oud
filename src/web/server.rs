use crate::Error;
use crate::core::config::settings::GuildSettings;
use crate::core::config::state::WebState;
use axum::http::{HeaderValue, Method, StatusCode, Uri};
use axum::routing::Router;
use axum::routing::method_routing::get;
use fred::clients::SubscriberClient;
use fred::prelude::*;
use std::env;
use std::net::SocketAddr;
use std::sync::Arc;
use moka::future::Cache;
use serenity::all::Http;
use tokio::sync::broadcast;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing::{debug, error, info, instrument, trace, warn};
use crate::features::live_feed;
use crate::features::live_feed::LogEvent;
use crate::web::router::get_router;

#[instrument(skip(db, http, redis_client, subscriber_client, guild_configs, tx))]
pub async fn start_web_server(
    db: sqlx::PgPool,
    http: Arc<Http>,
    redis_client: Client,
    subscriber_client: SubscriberClient,
    guild_configs: Cache<i64, GuildSettings>,
    tx: broadcast::Sender<LogEvent>,
) -> Result<(), Error> {
    if let Err(e) = live_feed::start_live_feed_subscriber(subscriber_client, tx.clone()).await {
        error!(error = ?e, "Failed to start live feed subscriber");
    }

    let cors = CorsLayer::new()
        .allow_origin("http://localhost:3000".parse::<HeaderValue>()?)
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([axum::http::header::CONTENT_TYPE]);

    let reqwest_client = reqwest::Client::new();
    let shared_secret = env::var("VERIFICATION_SECRET").ok();
    let cf_secret_key = env::var("TURNSTILE_SECRET").ok();
    let hc_secret_key = env::var("HCAPTCHA_SECRET").ok();
    let hc_site_key = env::var("HCAPTCHA_SITE_KEY").ok();

    let shared_state = Arc::new(WebState {
        tx,
        db,
        http,
        redis: redis_client,
        guild_configs,
        req_client: reqwest_client,
        shared_secret,
        cf_secret_key,
        hc_secret_key,
        hc_site_key
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