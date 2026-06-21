use crate::jobs;
use crate::models::safe_browsing::SafeBrowsingClient;
use crate::models::spam_tracker::SpamTracker;
use crate::types::config::config::GuildSettings;
use crate::types::{Data, Error};
use redis::Client;
use serenity::all::{Context, Ready};
use sqlx::{Pool, Postgres};
use std::future::Future;
use std::pin::Pin;
use tracing::{debug, info};

pub fn setup<'a>(
    safe_browsing_api_key: Option<String>,
    pool: Pool<Postgres>,
    redis_client: Client,
    guild_configs_cache: moka::future::Cache<i64, GuildSettings>, // <-- Added this parameter
    ctx: &'a Context,
    _ready: &'a Ready,
) -> Pin<Box<dyn Future<Output=Result<Data, Error>> + Send + 'a>> {
    Box::pin(async move {
        info!("Logged in as {}", _ready.user.name);

        let active_tickets_cache = moka::future::Cache::new(10_000);

        let mut redis_conn = redis_client.get_multiplexed_async_connection().await?;
        let active_tickets_list: Vec<String> = redis::cmd("SMEMBERS")
            .arg("active_tickets")
            .query_async(&mut redis_conn)
            .await
            .unwrap_or_default();

        for channel_str in active_tickets_list {
            if let Ok(channel_id) = channel_str.parse::<u64>() {
                active_tickets_cache.insert(channel_id, ()).await;
            }
        }
        let (tx, rx) = tokio::sync::mpsc::unbounded_channel();

        debug!("Hydrated {} active tickets into local cache.", active_tickets_cache.entry_count());

        jobs::sync_tickets::sync_tickets(
            &redis_client,
            &active_tickets_cache
        );

        jobs::temp_ban::start_temp_ban_worker(
            pool.clone(),
            ctx.http.clone(),
            redis_client.clone()
        );

        jobs::ticket_inactivity::start_ticket_inactivity_worker(
            pool.clone(),
            ctx.http.clone(),
            redis_client.clone(),
            guild_configs_cache.clone(),
        );

        jobs::flush_levels::start_level_flush_worker(
            pool.clone(),
            redis_client.clone()
        );

        jobs::ticket_logger::start_ticket_logger(rx, pool.clone());

        let spam_tracker = SpamTracker::new(redis_conn);
        let redis_conn = redis_client.get_multiplexed_async_connection().await?;
        let client = safe_browsing_api_key.map(SafeBrowsingClient::new);
        let audit_log_cache = moka::future::Cache::new(5000);

        Ok(Data {
            db: pool,
            redis: redis_conn,
            spam_tracker,
            safe_browsing_client: client,
            active_tickets: active_tickets_cache,
            guild_configs: guild_configs_cache,
            ticket_log_tx: tx,
            audit_log_cache,
        })
    })
}