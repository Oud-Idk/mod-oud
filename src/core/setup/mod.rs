pub mod jobs;

use crate::core::setup::jobs::start_jobs;
use crate::models::safe_browsing::SafeBrowsingClient;
use crate::models::spam_tracker::SpamTracker;
use crate::types::config::config::GuildSettings;
use crate::types::{Data, Error};
use fred::clients::{Client, SubscriberClient};
use fred::prelude::SetsInterface;
use moka::future::Cache;
use serenity::all::{Context, Ready};
use sqlx::{Pool, Postgres};
use std::env;
use std::pin::Pin;
use tracing::{debug, info};

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

        let active_tickets_cache = Cache::new(10_000);

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
        let audit_log_cache = Cache::new(5000);
        let shared_secret = env::var("VERIFICATION_SECRET").ok();
        let domain = env::var("DOMAIN").unwrap_or("localhost:3000".to_string());

        Ok(Data {
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
        })
    })
}