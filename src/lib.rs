use crate::core::config::settings::GuildSettings;
use crate::features::automod::{SafeBrowsingClient, SpamTracker};
use crate::features::message_logging::CachedAuditLogs;
use crate::features::tickets::TicketLogPayload;
use std::sync::Arc;
use tokio::sync::mpsc::UnboundedSender;

pub mod core;
pub mod events;
pub mod features;
pub mod shared;
pub mod web;

pub type Error = Box<dyn std::error::Error + Send + Sync>;
// TODO remove this bullshit, use anyhow
pub type Context<'a> = poise::Context<'a, Data, Error>;

pub struct Data {
    pub db: sqlx::PgPool,
    pub redis: fred::clients::Client,
    pub spam_tracker: SpamTracker,
    pub safe_browsing_client: Option<SafeBrowsingClient>,
    pub active_tickets: moka::future::Cache<u64, ()>,
    pub guild_configs: moka::future::Cache<i64, GuildSettings>,
    pub audit_log_cache: moka::future::Cache<u64, Arc<CachedAuditLogs>>,
    pub ticket_log_tx: UnboundedSender<TicketLogPayload>,
    pub shared_secret: Option<String>,
    pub domain: String,
}