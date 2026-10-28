use crate::core::config::settings::GuildSettings;
use crate::features::automod::{SafeBrowsingClient, SpamTracker, ToxicClassifier};
use crate::features::bad_words::CompiledRuleset;
use crate::features::live_feed::LogEvent;
use crate::features::message_logging::CachedAuditLogs;
use crate::features::music::{MusicState, WebCommandBus};
use crate::features::tickets::TicketLogPayload;
use crate::shared::spotify_auth::SpotifyAuthCache;
use crate::shared::username_cache::UserUpdate;
use serenity::all::{ChannelId, GuildId, ShardInfo};
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
    pub guild_configs_cache: moka::future::Cache<GuildId, GuildSettings>,

    /// Channel sender for queueing asynchronous username updates.
    pub username_tx: tokio::sync::mpsc::Sender<UserUpdate>,

    /// Application environment configuration parameters.
    pub config: AppConfig,

    /// Global cache for the `Spotify` Client Credentials token.
    ///
    /// Shared via `Arc` so any feature (music, future `Spotify` integrations,
    /// etc.) can reuse the same auth state without a separate static.
    pub spotify_auth: Arc<SpotifyAuthCache>,
}

/// Global environment configuration parameters loaded at startup.
#[derive(Clone)]
pub struct AppConfig {
    /// Optional shared secret key used for internal service verification.
    pub shared_secret: Option<String>,

    /// Shared secret for backend-to-backend authentication (dashboard server -> Rust API).
    /// If `None`, protected routes will reject all requests with 500 (misconfigured).
    pub internal_api_secret: Option<String>,

    /// Optional Cloudflare Turnstile secret key for captcha checks.
    pub cf_secret_key: Option<String>,

    /// Optional hCaptcha secret key for captcha checks.
    pub hc_secret_key: Option<String>,

    /// Optional hCaptcha public site key.
    pub hc_site_key: Option<String>,

    /// Optional Giphy API key
    pub giphy_api_key: Option<String>,

    /// Optional Klipy API key
    pub klipy_api_key: Option<String>,

    /// Google Cloud API key
    pub google_cloud_api_key: String,

    /// Optional Genius API key
    pub genius_api_key: Option<String>,

    /// Optional TMDB API key
    pub tmdb_api_key: Option<String>,

    /// Optional RAWG API key
    pub rawg_api_key: Option<String>,

    /// Optional Wordnik API key
    pub wordnik_api_key: Option<String>,

    /// Whether optional heavy features, such as ML inference, are enabled.
    pub heavy_features: bool,

    /// Dashboard origin used to build absolute links (e.g. verification URLs),
    /// including the scheme: `http://localhost:3000` locally,
    /// `https://dashboard.example.com` in production.
    pub domain: String,
}

/// Reads a boolean flag, treating only `true` (any case) as on.
fn env_flag(key: &str) -> bool {
    std::env::var(key).is_ok_and(|value| value.eq_ignore_ascii_case("true"))
}

/// Reads a secret from the environment, treating an empty value as absent.
fn secret_from_env(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use super::secret_from_env;
    use std::sync::Mutex;

    // `set_var` is process-global, so these tests must not overlap.
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn empty_secret_reads_as_absent() {
        let _guard = ENV_LOCK.lock().unwrap();
        let key = "MOD_OUD_TEST_EMPTY_SECRET";
        unsafe { std::env::set_var(key, "") };
        assert_eq!(secret_from_env(key), None);
    }

    #[test]
    fn whitespace_secret_reads_as_absent() {
        let _guard = ENV_LOCK.lock().unwrap();
        let key = "MOD_OUD_TEST_BLANK_SECRET";
        unsafe { std::env::set_var(key, "   ") };
        assert_eq!(secret_from_env(key), None);
    }

    #[test]
    fn real_secret_is_returned_trimmed() {
        let _guard = ENV_LOCK.lock().unwrap();
        let key = "MOD_OUD_TEST_REAL_SECRET";
        unsafe { std::env::set_var(key, "  s3cret  ") };
        assert_eq!(secret_from_env(key), Some("s3cret".to_string()));
    }

    #[test]
    fn unset_secret_is_none() {
        let _guard = ENV_LOCK.lock().unwrap();
        assert_eq!(
            secret_from_env("MOD_OUD_TEST_DEFINITELY_UNSET_SECRET"),
            None
        );
    }
}

impl AppConfig {
    /// Loads configuration parameters from process environment variables.
    ///
    /// An empty secret is loaded as absent. An empty string is a valid HMAC key and would make
    /// every signature publicly reproducible, so it must read the same as an unset variable.
    ///
    /// # Panics
    ///
    /// Panics if the `GOOGLE_CLOUD_API_KEY` environment variable is not set.
    #[must_use]
    pub fn from_env() -> Self {
        Self {
            shared_secret: secret_from_env("VERIFICATION_SECRET"),
            internal_api_secret: secret_from_env("INTERNAL_API_SECRET"),
            cf_secret_key: secret_from_env("TURNSTILE_SECRET"),
            hc_secret_key: secret_from_env("HCAPTCHA_SECRET"),
            hc_site_key: std::env::var("HCAPTCHA_SITE_KEY").ok(),
            giphy_api_key: std::env::var("GIPHY_API_KEY").ok(),
            klipy_api_key: std::env::var("KLIPY_API_KEY").ok(),
            heavy_features: env_flag("ENABLE_HEAVY_FEAT"),
            domain: std::env::var("DOMAIN")
                .unwrap_or_else(|_| "http://localhost:3000".to_string())
                .trim_end_matches('/')
                .to_string(),
            google_cloud_api_key: std::env::var("GOOGLE_CLOUD_API_KEY")
                .expect("Environment variable GOOGLE_CLOUD_API_KEY not set."),
            genius_api_key: std::env::var("GENIUS_API_KEY").ok(),
            tmdb_api_key: std::env::var("TMDB_API_KEY").ok(),
            rawg_api_key: std::env::var("RAWG_API_KEY").ok(),
            wordnik_api_key: std::env::var("WORDNIK_API_KEY").ok(),
        }
    }
}

/// In-memory caches for transient bot state and feature data.
#[derive(Clone)]
pub struct BotCaches {
    /// Cache tracking currently active support ticket channel IDs.
    pub active_tickets: moka::future::Cache<ChannelId, ()>,

    /// Cache storing recently fetched Discord audit log entries.
    pub audit_logs: moka::future::Cache<GuildId, Arc<CachedAuditLogs>>,

    /// Cache all bad word rulesets for bad word feature
    pub bad_words: moka::future::Cache<GuildId, Arc<Vec<CompiledRuleset>>>,
}

/// Security and automated moderation services.
#[derive(Clone)]
pub struct BotSecurity {
    /// Service tracking user message activity for anti-spam detection.
    pub spam_tracker: SpamTracker,

    /// Optional Google Safe Browsing client for checking malicious URLs.
    pub safe_browsing: SafeBrowsingClient,
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

    /// Client for the ML toxicity classifier service, absent when heavy features are off.
    pub toxic_classifier: Option<ToxicClassifier>,
}
