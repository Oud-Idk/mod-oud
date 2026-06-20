use crate::models::spam_tracker::SpamTracker;
use crate::types::config::config::GuildSettings;
use crate::SafeBrowsingClient;
use chrono::{DateTime, Utc};
use payloads::{DeletedMessagePayload, ModifiedMessagePayload, ReportedMessagePayload};
use prost::Message;
use serde::{Deserialize, Serialize};

pub mod flag;
pub mod embed;
pub mod config;
pub mod payloads;
pub mod dashboard;

pub type Error = Box<dyn std::error::Error + Send + Sync>;
pub type Context<'a> = poise::Context<'a, Data, Error>;

pub struct Data {
    pub db: sqlx::PgPool,
    pub redis: redis::aio::MultiplexedConnection,
    pub spam_tracker: SpamTracker,
    pub safe_browsing_client: Option<SafeBrowsingClient>,
    pub active_tickets: moka::future::Cache<u64, ()>,
    pub guild_configs: moka::future::Cache<i64, GuildSettings>,
}

#[derive(Clone, PartialEq, Message)]
pub struct Duration {
    #[prost(int64, tag = "1")]
    pub seconds: i64,
    #[prost(int32, tag = "2")]
    pub nanos: i32,
}

#[derive(Clone, PartialEq, Message)]
pub struct SearchUrlsResponse {
    #[prost(message, repeated, tag = "1")]
    pub threats: Vec<ThreatUrl>,
    #[prost(message, optional, tag = "2")]
    pub cache_duration: Option<Duration>,
}

#[derive(Clone, PartialEq, Message)]
pub struct ThreatUrl {
    #[prost(string, tag = "1")]
    pub url: String,
    #[prost(int32, repeated, tag = "2")]
    pub threat_types: Vec<i32>,
}


#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(tag = "type", content = "payload")]
pub enum LogEvent {
    MessageDelete(DeletedMessagePayload),
    MessageEdit(ModifiedMessagePayload),
    MessageReport(ReportedMessagePayload),
}

/// Intermediate representation of warning data used for unified display.
pub struct WarningInfo {
    pub id: i32,
    pub user_id: i64,
    pub moderator_id: i64,
    pub reason: Option<String>,
    pub created_at: Option<DateTime<Utc>>,
    pub is_active: Option<bool>,
}

/// Common metadata extracted from a guild-only command context.
pub struct GuildMetadata {
    pub id: serenity::all::GuildId,
    pub name: String,
    pub author_id: serenity::all::UserId,
    pub icon_url: Option<String>,
}

impl GuildMetadata {
    /// Safely extracts guild ID, guild name, and author ID from the context.
    pub fn extract(ctx: &Context<'_>) -> Result<Self, Error> {
        let guild_id = ctx
            .guild_id()
            .ok_or("This command must be executed within a server")?;

        let guild_name = ctx
            .guild()
            .map(|g| g.name.clone())
            .ok_or("Failed to retrieve guild information")?;

        let guild_icon = ctx
            .guild()
            .map(|g| g.icon_url())
            .ok_or("Failed to retrieve guild information")?;

        Ok(Self {
            id: guild_id,
            name: guild_name,
            author_id: ctx.author().id,
            icon_url: guild_icon,
        })
    }
}