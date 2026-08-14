use crate::core::config::settings::GuildSettings;
use crate::features::automod::{SafeBrowsingClient, SpamTracker};
use crate::features::bad_words::CompiledRuleset;
use crate::features::live_feed::LogEvent;
use crate::features::message_logging::CachedAuditLogs;
use crate::features::music::MusicState;
use crate::features::music::web_command::WebCommandBus;
use crate::features::tickets::TicketLogPayload;
use crate::shared::username_cache::UserUpdate;
use serenity::all::ShardInfo;
use std::sync::Arc;
use tokio::sync::broadcast;
use tokio::sync::mpsc::UnboundedSender;

/// Alias for `anyhow::Error`
pub type Error = anyhow::Error;

/// Type alias for the Poise framework command context using [`BotData`] and [`Error`].
pub type Context<'a> = poise::Context<'a, BotData, Error>;

/// Shared core infrastructure services used across the application.
#[derive(Clone)]
pub struct CoreServices {
    /// `PostgreSQL` database connection pool managed by `SQLx`.
    pub db: sqlx::PgPool,

    /// Redis client connection managed by `Fred`.
    pub redis: fred::clients::Client,

    /// Shared HTTP client for making external web requests.
    pub reqwest_client: reqwest::Client,

    /// In-memory cache for [`GuildSettings`], indexed by Discord guild ID.
    pub guild_configs_cache: moka::future::Cache<u64, GuildSettings>,

    /// Channel sender for queueing asynchronous username updates.
    pub username_tx: tokio::sync::mpsc::Sender<UserUpdate>,

    /// Application environment configuration parameters.
    pub config: AppConfig,
}

/// Global environment configuration parameters loaded at startup.
#[derive(Clone)]
pub struct AppConfig {
    /// Optional shared secret key used for internal service verification.
    pub shared_secret: Option<String>,

    /// Optional Cloudflare Turnstile secret key for captcha checks.
    pub cf_secret_key: Option<String>,

    /// Optional hCaptcha secret key for captcha checks.
    pub hc_secret_key: Option<String>,

    /// Optional hCaptcha public site key.
    pub hc_site_key: Option<String>,

    /// Web server domain name (defaults to `"localhost:3000"`).
    pub domain: String,
}

impl AppConfig {
    /// Loads configuration parameters from process environment variables.
    #[must_use]
    pub fn from_env() -> Self {
        Self {
            shared_secret: std::env::var("VERIFICATION_SECRET").ok(),
            cf_secret_key: std::env::var("TURNSTILE_SECRET").ok(),
            hc_secret_key: std::env::var("HCAPTCHA_SECRET").ok(),
            hc_site_key: std::env::var("HCAPTCHA_SITE_KEY").ok(),
            domain: std::env::var("DOMAIN").unwrap_or_else(|_| "localhost:3000".to_string()),
        }
    }
}

/// In-memory caches for transient bot state and feature data.
#[derive(Clone)]
pub struct BotCaches {
    /// Cache tracking currently active support ticket channel IDs.
    pub active_tickets: moka::future::Cache<u64, ()>,

    /// Cache storing recently fetched Discord audit log entries.
    pub audit_logs: moka::future::Cache<u64, Arc<CachedAuditLogs>>,

    /// Cache all bad word rulesets for bad word feature
    pub bad_words: moka::future::Cache<u64, Arc<Vec<CompiledRuleset>>>,
}

/// Security and automated moderation services.
#[derive(Clone)]
pub struct BotSecurity {
    /// Service tracking user message activity for anti-spam detection.
    pub spam_tracker: SpamTracker,

    /// Optional Google Safe Browsing client for checking malicious URLs.
    pub safe_browsing: Option<SafeBrowsingClient>,
}

/// Shared application state for the web dashboard server API.
#[derive(Clone)]
pub struct WebState {
    /// Shared core infrastructure services.
    pub core: CoreServices,

    /// Shared Serenity HTTP client for issuing Discord REST API requests.
    pub serenity_http: Arc<poise::serenity_prelude::Http>,

    /// Broadcast channel sender for pushing live log events to web clients.
    pub message_event_tx: broadcast::Sender<LogEvent>,

    /// Event bus for receiving commands issued from the web dashboard.
    pub web_commands: WebCommandBus,

    /// Shared state manager for music player playback.
    pub music_state: MusicState,
}

/// Central application data stored inside the Poise framework context.
#[derive(Clone)]
pub struct BotData {
    /// Core infrastructure services (database, Redis, HTTP, configuration).
    pub core: CoreServices,

    /// Security services for automated moderation and link safety.
    pub security: BotSecurity,

    /// In-memory caches for transient bot operations.
    pub caches: BotCaches,

    /// Unbounded channel sender for dispatching asynchronous ticket logging payloads.
    pub ticket_log_tx: UnboundedSender<TicketLogPayload>,

    /// Metadata describing the current Discord gateway shard instance.
    pub shard_info: ShardInfo,

    /// Shared state manager for music player playback.
    pub music_state: MusicState,
}
