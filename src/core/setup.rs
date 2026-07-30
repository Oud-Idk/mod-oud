use crate::core::config::settings::GuildSettings;
use crate::features::automod::{SafeBrowsingClient, SpamTracker};
use crate::features::leveling::start_level_flush_worker;
use crate::features::member_counter::start_member_counter_job;
use crate::features::moderation::start_temp_ban_worker;
use crate::features::reminder::start_reminder_worker;
use crate::features::tickets::{TicketLogPayload, start_ticket_inactivity_worker, start_ticket_logger, sync_tickets};
use crate::{Data, Error};
use fred::clients::{Client, SubscriberClient};
use fred::interfaces::SetsInterface;
use moka::future::Cache;
use serenity::all::{Context, Ready, ShardManager};
use sqlx::{Pool, Postgres};
use std::env;
use std::pin::Pin;
use std::sync::Arc;
use tokio::sync::mpsc::UnboundedReceiver;
use tracing::{debug, error, info};
use crate::features::birthday::start_birthday_worker;
use crate::features::giveaways::start_giveaway_worker;
use crate::features::raid_detection::reconcile_active_raids;

pub fn setup<'a>(
    safe_browsing_api_key: Option<String>,
    pool: Pool<Postgres>,
    redis_client: Client,
    subscriber_client: SubscriberClient,
    guild_configs_cache: Cache<i64, GuildSettings>,
    ctx: &'a Context,
    _ready: &'a Ready,
) -> Pin<Box<dyn Future<Output=Result<Data, Error>> + Send + 'a>> {
    Box::pin(async move {
        info!("Logged in as {}", _ready.user.name);

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
        let (tx, rx) = tokio::sync::mpsc::unbounded_channel();

        debug!("Hydrated {} active tickets into local cache.", active_tickets_cache.entry_count());

        start_jobs(&pool, &redis_client, &subscriber_client, &guild_configs_cache, ctx, &active_tickets_cache, rx);

        let spam_tracker = SpamTracker::new(redis_client.clone());
        let client = safe_browsing_api_key.map(SafeBrowsingClient::new);
        let audit_log_cache = Cache::new(10000);

        let shared_secret = env::var("VERIFICATION_SECRET").ok();
        let domain = env::var("DOMAIN").unwrap_or("localhost:3000".to_string());

        let data = Data {
            db: pool,
            redis: redis_client,
            spam_tracker,
            safe_browsing_client: client,
            active_tickets: active_tickets_cache,
            guild_configs: guild_configs_cache,
            ticket_log_tx: tx,
            audit_log_cache,
            shared_secret,
            domain,
        };

        if let Err(e) = reconcile_active_raids(&ctx, &data).await {
            error!(error = ?e, "Error reconciling active raids on startup");
        }

        Ok(data)
    })
}

pub fn start_jobs(db: &Pool<Postgres>, redis_client: &Client, subscriber_client: &SubscriberClient, guild_configs_cache: &Cache<i64, GuildSettings>, ctx: &Context, active_tickets_cache: &Cache<u64, ()>, rx: UnboundedReceiver<TicketLogPayload>) {
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
}

pub struct ShardManagerContainer;

impl serenity::prelude::TypeMapKey for ShardManagerContainer {
    type Value = Arc<ShardManager>;
}