use crate::core::config::settings::GuildSettings;
use crate::core::config::state::{AppConfig, BotCaches, BotData, BotSecurity, CoreServices, Error};
use crate::features::automod::{SafeBrowsingClient, SpamTracker};
use crate::features::birthday::start_birthday_worker;
use crate::features::giveaways::start_giveaway_worker;
use crate::features::leveling::start_level_flush_worker;
use crate::features::member_counter::start_member_counter_job;
use crate::features::moderation::start_temp_ban_worker;
use crate::features::music::web_command::WebCommand;
use crate::features::music::{
    MusicState, start_music_stats_prune_worker, start_music_web_control_worker,
};
use crate::features::raid_detection::reconcile_active_raids;
use crate::features::reminder::start_reminder_worker;
use crate::features::tickets::{
    TicketLogPayload, start_ticket_inactivity_worker, start_ticket_logger, sync_tickets,
};
use crate::shared::username_cache::{UserUpdate, start_username_batch_worker};
use fred::clients::{Client, SubscriberClient};
use fred::interfaces::SetsInterface;
use moka::future::Cache;
use serenity::all::{Context, Ready, ShardId, ShardInfo, ShardManager};
use sqlx::{Pool, Postgres};
use std::env;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio::sync::mpsc::UnboundedReceiver;
use tracing::{debug, error, info};

/// Parameters and dependencies required to initialize core bot state and background tasks.
pub struct SetupParams<'a> {
    /// Optional Google Safe Browsing API key for URL safety checks.
    pub safe_browsing_api_key: Option<String>,

    /// `PostgreSQL` database connection pool.
    pub pool: Pool<Postgres>,

    /// Primary Redis client connection.
    pub redis_client: Client,

    /// Redis Pub/Sub subscriber client.
    pub subscriber_client: SubscriberClient,

    /// Shared Moka cache for guild settings.
    pub guild_configs_cache: Cache<u64, GuildSettings>,

    /// Serenity framework context.
    pub ctx: &'a Context,

    /// Channel sender for queueing username updates.
    pub username_tx: mpsc::Sender<UserUpdate>,

    /// Channel receiver for processing username updates.
    pub username_rx: mpsc::Receiver<UserUpdate>,

    /// Shared HTTP client.
    pub reqwest_client: reqwest::Client,

    /// Receiver channel for web dashboard commands.
    pub web_command_rx: UnboundedReceiver<WebCommand>,

    /// Music playback state manager.
    pub music_state: MusicState,

    /// Serenity gateway `Ready` event payload.
    pub ready: &'a Ready,
}

/// Initializes core bot state, hydrates local caches, and starts background worker tasks upon gateway login.
///
/// # Arguments
/// * `safe_browsing_api_key` - Optional Google Safe Browsing API key for URL safety checks.
/// * `pool` - `PostgreSQL` database connection pool.
/// * `redis_client` - Primary Redis client connection.
/// * `subscriber_client` - Redis Pub/Sub subscriber client.
/// * `guild_configs_cache` - Shared Moka cache for guild settings.
/// * `ctx` - Serenity framework context.
/// * `username_tx` - Channel sender for queueing username updates.
/// * `username_rx` - Channel receiver for processing username updates.
/// * `reqwest_client` - Shared HTTP client.
/// * `web_command_rx` - Receiver channel for web dashboard commands.
/// * `music_state` - Music playback state manager.
/// * `ready` - Serenity gateway `Ready` event payload.
///
/// # Panics
/// When environmental variables `SHARD_INDEX` and `TOTAL_SHARDS` is empty, it will panic.
#[must_use]
pub fn setup<'a>(
    params: SetupParams<'a>,
) -> Pin<Box<dyn Future<Output = Result<BotData, Error>> + Send + 'a>> {
    Box::pin(async move {
        let SetupParams {
            safe_browsing_api_key,
            pool,
            redis_client,
            subscriber_client,
            guild_configs_cache,
            ctx,
            username_tx,
            username_rx,
            reqwest_client,
            web_command_rx,
            music_state,
            ready,
        } = params;

        info!("Logged in as {}", ready.user.name);

        let active_tickets_cache = hydrate_active_tickets_cache(&redis_client).await;

        debug!(
            "Hydrated {} active tickets into local cache.",
            active_tickets_cache.entry_count()
        );

        let (ticket_tx, ticket_rx) = mpsc::unbounded_channel();

        start_jobs(
            &pool,
            &redis_client,
            &subscriber_client,
            &guild_configs_cache,
            ctx,
            &active_tickets_cache,
            ticket_rx,
            username_rx,
        );

        let spam_tracker = SpamTracker::new(redis_client.clone());
        let client = safe_browsing_api_key.map(SafeBrowsingClient::new);
        let audit_log_cache = Cache::new(10000);

        let shard_index: u32 = env::var("SHARD_INDEX")
            .unwrap_or_else(|_| "0".to_string())
            .parse()
            .expect("SHARD_INDEX must be a valid u32");

        let total_shards: u32 = env::var("TOTAL_SHARDS")
            .unwrap_or_else(|_| "1".to_string())
            .parse()
            .expect("TOTAL_SHARDS must be a valid u32");

        if let Some(songbird) = songbird::get(ctx).await {
            start_music_web_control_worker(
                web_command_rx,
                music_state.clone(),
                songbird,
                reqwest_client.clone(),
                ctx.http.clone(),
            );
        }

        let bad_words_cache = moka::future::Cache::new(10_000);

        let data = BotData {
            core: CoreServices {
                db: pool,
                redis: redis_client,
                reqwest_client,
                guild_configs_cache,
                username_tx,
                config: AppConfig::from_env(),
            },
            security: BotSecurity {
                spam_tracker,
                safe_browsing: client,
            },
            caches: BotCaches {
                active_tickets: active_tickets_cache,
                audit_logs: audit_log_cache,
                bad_words: bad_words_cache,
            },
            ticket_log_tx: ticket_tx,
            shard_info: ShardInfo {
                id: ShardId(shard_index),
                total: total_shards,
            },
            music_state,
        };

        if let Err(e) = reconcile_active_raids(ctx, &data).await {
            error!(error = ?e, "Error reconciling active raids on startup");
        }

        Ok(data)
    })
}

/// Hydrates the local active ticket channel cache from Redis set storage.
async fn hydrate_active_tickets_cache(redis_client: &Client) -> Cache<u64, ()> {
    let active_tickets_cache = Cache::new(20_000);

    let active_tickets_list: Vec<String> = redis_client
        .smembers("active_tickets")
        .await
        .unwrap_or_default();

    for channel_str in active_tickets_list {
        if let Ok(channel_id) = channel_str.parse::<u64>() {
            active_tickets_cache.insert(channel_id, ()).await;
        }
    }
    active_tickets_cache
}

/// Spawns background worker tasks for tickets, moderation, level flushing, reminders, and feature jobs.
pub fn start_jobs(
    db: &Pool<Postgres>,
    redis_client: &Client,
    subscriber_client: &SubscriberClient,
    guild_configs_cache: &Cache<u64, GuildSettings>,
    ctx: &Context,
    active_tickets_cache: &Cache<u64, ()>,
    rx: UnboundedReceiver<TicketLogPayload>,
    username_rx: mpsc::Receiver<UserUpdate>,
) {
    sync_tickets(redis_client, subscriber_client, active_tickets_cache);

    start_ticket_inactivity_worker(
        db.clone(),
        ctx.http.clone(),
        redis_client.clone(),
        guild_configs_cache.clone(),
    );

    start_ticket_logger(rx, db.clone());

    start_temp_ban_worker(db.clone(), ctx.http.clone(), redis_client.clone());

    start_level_flush_worker(db.clone(), redis_client.clone());

    start_reminder_worker(db.clone(), ctx.http.clone(), redis_client.clone());

    start_member_counter_job(
        ctx.http.clone(),
        ctx.cache.clone(),
        db.clone(),
        redis_client.clone(),
        guild_configs_cache.clone(),
    );

    start_giveaway_worker(db.clone(), ctx.http.clone());

    start_birthday_worker(
        db.clone(),
        redis_client.clone(),
        guild_configs_cache.clone(),
        ctx.clone(),
    );

    start_username_batch_worker(db.clone(), username_rx);

    start_music_stats_prune_worker(db.clone(), redis_client.clone());
}

/// Serenity [`TypeMapKey`](serenity::prelude::TypeMapKey) container for storing the shared [`ShardManager`].
pub struct ShardManagerContainer;

impl serenity::prelude::TypeMapKey for ShardManagerContainer {
    type Value = Arc<ShardManager>;
}
