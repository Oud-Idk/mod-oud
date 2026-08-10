use crate::core::config::settings::GuildSettings;
use crate::features::live_feed::LogEvent;
use fred::clients::Client;
use std::sync::Arc;
use tokio::sync::broadcast;

#[derive(Clone)]
pub struct WebState {
    pub tx: broadcast::Sender<LogEvent>,
    pub db: sqlx::PgPool,
    pub http: Arc<poise::serenity_prelude::Http>,
    pub redis: Client,
    pub username_buf_tx: tokio::sync::mpsc::Sender<crate::UserUpdate>,
    pub guild_configs: moka::future::Cache<i64, GuildSettings>,
    pub req_client: reqwest::Client,
    pub shared_secret: Option<String>,
    pub cf_secret_key: Option<String>,
    pub hc_secret_key: Option<String>,
    pub hc_site_key: Option<String>,
}