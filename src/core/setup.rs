use crate::core::config::settings::GuildSettings;
use crate::core::config::state::{AppConfig, BotCaches, BotData, BotSecurity, CoreServices, Error};
use crate::features::automod::{SafeBrowsingClient, SpamTracker};
use crate::features::birthday::start_birthday_worker;
use crate::features::giveaways::start_giveaway_worker;
use crate::features::leveling::start_level_flush_worker;
use crate::features::member_counter::start_member_counter_job;
use crate::features::moderation::start_temp_ban_worker;
use crate::features::music::MusicState;
use crate::features::raid_detection::reconcile_active_raids;
use crate::features::reminder::start_reminder_worker;
use crate::features::tickets::{TicketLogPayload, start_ticket_inactivity_worker, start_ticket_logger, sync_tickets};
use crate::shared::username_cache::{UserUpdate, run_username_batch_worker, start_username_batch_worker};
use fred::clients::{Client, SubscriberClient};
use fred::interfaces::SetsInterface;
use moka::future::Cache;
use serenity::all::{Context, Ready, ShardId, ShardInfo, ShardManager};
use sqlx::{Pool, Postgres};
use std::env;
use std::pin::Pin;
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio::sync::mpsc::UnboundedReceiver;
use tracing::{debug, error, info};

pub fn setup<'a>(
    safe_browsing_api_key: Option<String>,
    pool: Pool<Postgres>,
    redis_client: Client,
    subscriber_client: SubscriberClient,
    guild_configs_cache: Cache<i64, GuildSettings>,
    ctx: &'a Context,
    username_tx: mpsc::Sender<UserUpdate>,
    username_rx: mpsc::Receiver<UserUpdate>,
    reqwest_client: reqwest::Client,
    ready: &'a Ready,
) -> Pin<Box<dyn Future<Output=Result<BotData, Error>> + Send + 'a>> {
    Box::pin(async move {
        info!("Logged in as {}", ready.user.name);

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
        let (tx, rx) = mpsc::unbounded_channel();

        debug!("Hydrated {} active tickets into local cache.", active_tickets_cache.entry_count());

        start_jobs(&pool, &redis_client, &subscriber_client, &guild_configs_cache, ctx, &active_tickets_cache, rx, username_rx);

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

        let music_state = MusicState::default();

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
            },
            ticket_log_tx: tx,
            shard_info: ShardInfo {
                id: ShardId(shard_index),
                total: total_shards,
            },
            music_state,
        };

        if let Err(e) = reconcile_active_raids(&ctx, &data).await {
            error!(error = ?e, "Error reconciling active raids on startup");
        }

        Ok(data)
    })
}

pub fn start_jobs(db: &Pool<Postgres>, redis_client: &Client, subscriber_client: &SubscriberClient, guild_configs_cache: &Cache<i64, GuildSettings>, ctx: &Context, active_tickets_cache: &Cache<u64, ()>, rx: UnboundedReceiver<TicketLogPayload>, username_rx: mpsc::Receiver<UserUpdate>) {
    sync_tickets(
        &redis_client,
        &subscriber_client,
        &active_tickets_cache
    );

    start_ticket_inactivity_worker(
        db.clone(),
        ctx.http.clone(),
        redis_client.clone(),
        guild_configs_cache.clone(),
    );

    start_ticket_logger(rx, db.clone());

    start_temp_ban_worker(
        db.clone(),
        ctx.http.clone(),
        redis_client.clone()
    );

    start_level_flush_worker(
        db.clone(),
        redis_client.clone()
    );

    start_reminder_worker(db.clone(), ctx.http.clone(), redis_client.clone());

    start_member_counter_job(ctx.http.clone(), ctx.cache.clone(), db.clone(), redis_client.clone(), guild_configs_cache.clone());

    start_giveaway_worker(db.clone(), ctx.http.clone());

    start_birthday_worker(db.clone(), redis_client.clone(), guild_configs_cache.clone(), ctx.clone());

    start_username_batch_worker(db.clone(), username_rx);
}

pub struct ShardManagerContainer;

impl serenity::prelude::TypeMapKey for ShardManagerContainer {
    type Value = Arc<ShardManager>;
}