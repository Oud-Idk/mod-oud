use crate::models::spam_tracker::SpamTracker;
use crate::types::{Data, Error};
use crate::{jobs, SafeBrowsingClient};
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
    ctx: &'a Context,
    _ready: &'a Ready,
) -> Pin<Box<dyn Future<Output=Result<Data, Error>> + Send + 'a>> {
    Box::pin(async move {
        info!("Logged in as {}", _ready.user.name);

        let active_tickets_cache = moka::future::Cache::new(10_000);
        let guild_configs_cache = moka::future::Cache::new(5000);

        let mut redis_conn_setup = redis_client.get_multiplexed_async_connection().await?;
        let active_tickets_list: Vec<String> = redis::cmd("SMEMBERS")
            .arg("active_tickets")
            .query_async(&mut redis_conn_setup)
            .await
            .unwrap_or_default();

        for channel_str in active_tickets_list {
            if let Ok(channel_id) = channel_str.parse::<u64>() {
                active_tickets_cache.insert(channel_id, ()).await;
            }
        }

        // Moka cache length is accessed via .entry_count()
        debug!("Hydrated {} active tickets into local cache.", active_tickets_cache.entry_count());

        // 3. Pass the Moka cache into sync_tickets (matches our new signature)
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

        let spam_tracker = SpamTracker::new(redis_client.clone());
        let redis_conn = redis_client.get_multiplexed_async_connection().await?;
        let client = safe_browsing_api_key.map(SafeBrowsingClient::new);

        Ok(Data {
            db: pool,
            redis: redis_conn,
            spam_tracker,
            safe_browsing_client: client,
            active_tickets: active_tickets_cache,
            guild_configs: guild_configs_cache,
        })
    })
}