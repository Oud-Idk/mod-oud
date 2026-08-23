use crate::core::config::settings::GuildSettings;
use crate::core::config::state::{AppConfig, BotCaches, BotData, BotSecurity, CoreServices, Error};
use crate::features::automod::{SafeBrowsingClient, SpamTracker};
use crate::features::birthday::start_birthday_worker;
use crate::features::giveaways::start_giveaway_worker;
use crate::features::leveling::start_level_flush_worker;
use crate::features::member_counter::start_member_counter_job;
use crate::features::moderation::start_temp_ban_worker;
use crate::features::music::WebCommand;
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
use serenity::all::{ChannelId, Context, GuildId, Ready, ShardId, ShardInfo, ShardManager};
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
    pub google_cloud_api_key: String,

    /// `PostgreSQL` database connection pool.
    pub pool: Pool<Postgres>,

    /// Primary Redis client connection.
    pub redis_client: Client,

    /// Redis Pub/Sub subscriber client.
    pub subscriber_client: SubscriberClient,

    /// Shared Moka cache for guild settings.
    pub guild_configs_cache: Cache<GuildId, GuildSettings>,

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
/// * `google_cloud_api_key` - Optional Google Safe Browsing API key for URL safety checks.
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
) -> Pin<Box<dyn Future<Output=Result<BotData, Error>> + Send + 'a>> {
    Box::pin(async move {
        let SetupParams {
            google_cloud_api_key,
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

        start_jobs(JobParams {
            db: &pool,
            redis_client: &redis_client,
            subscriber_client: &subscriber_client,
            guild_configs_cache: &guild_configs_cache,
            username_tx: &username_tx,
            ctx,
            active_tickets_cache: &active_tickets_cache,
            ticket_rx,
            username_rx,
        });

        let spam_tracker = SpamTracker::new(redis_client.clone());
        let client = SafeBrowsingClient::new(google_cloud_api_key);
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

        let bad_words_cache = Cache::new(10_000);

        let data = BotData {
            core: CoreServices {
                db: pool,
                redis: redis_client,
                reqwest_client,
                guild_configs_cache,
                username_tx,
                config: AppConfig::from_env(),
                spotify_auth: music_state.spotify_auth.clone(),
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
async fn hydrate_active_tickets_cache(redis_client: &Client) -> Cache<ChannelId, ()> {
    let active_tickets_cache = Cache::new(20_000);

    let active_tickets_list: Vec<String> = redis_client
        .smembers("active_tickets")
        .await
        .unwrap_or_default();

    for channel_str in active_tickets_list {
        if let Ok(channel_id) = channel_str.parse::<u64>() {
            active_tickets_cache
                .insert(ChannelId::from(channel_id), ())
                .await;
        }
    }
    active_tickets_cache
}

/// Parameters needed to spin up all the background worker jobs.
pub struct JobParams<'a> {
    /// Database pool for `PostgreSQL`.
    pub db: &'a Pool<Postgres>,

    /// Primary Redis client for caching and pub/sub.
    pub redis_client: &'a Client,

    /// Redis subscriber client.
    pub subscriber_client: &'a SubscriberClient,

    /// Shared Moka cache for guild settings.
    pub guild_configs_cache: &'a Cache<GuildId, GuildSettings>,

    /// Serenity context.
    pub ctx: &'a Context,

    /// Cache for tracking active ticket channels.
    pub active_tickets_cache: &'a Cache<ChannelId, ()>,

    /// Channel receiver for ticket log payloads.
    pub ticket_rx: UnboundedReceiver<TicketLogPayload>,

    /// Channel receiver for processing username updates.
    pub username_rx: mpsc::Receiver<UserUpdate>,

    /// Channel transmitter for storing usernames.
    pub username_tx: &'a mpsc::Sender<UserUpdate>,
}

/// Spawns background worker tasks for tickets, moderation, level flushing, reminders, and feature jobs.
pub fn start_jobs(params: JobParams) {
    let JobParams {
        db,
        redis_client,
        subscriber_client,
        guild_configs_cache,
        ctx,
        active_tickets_cache,
        ticket_rx,
        username_rx,
        username_tx,
    } = params;

    sync_tickets(redis_client, subscriber_client, active_tickets_cache);

    start_ticket_inactivity_worker(
        db.clone(),
        ctx.http.clone(),
        redis_client.clone(),
        guild_configs_cache.clone(),
    );

    start_ticket_logger(ticket_rx, db.clone());

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
        username_tx.clone(),
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
