use crate::core::config::settings::GuildSettings;
use crate::core::config::settings::get_settings;
use crate::features::member_counter::counters::update_guild_counters;
use fred::clients::Client;
use moka::future::Cache;
use serenity::all::{GuildId, Http};
use sqlx::PgPool;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::time::{Instant, interval};
use tracing::{error, info, trace, warn};

/// Starts the member counter background task loop.
pub fn start_member_counter_job(
    http: Arc<Http>,
    serenity_cache: Arc<serenity::all::Cache>,
    db: PgPool,
    redis: Client,
    cache: Cache<GuildId, GuildSettings>,
) {
    tokio::spawn(async move {
        info!("Member counter background job started");

        let mut last_updated: HashMap<GuildId, Instant> = HashMap::new();

        let mut timer = interval(Duration::from_mins(1));

        loop {
            timer.tick().await;

            if let Err(e) = process_all_member_counters(
                &http,
                &serenity_cache,
                &db,
                &redis,
                &cache,
                &mut last_updated,
            )
            .await
            {
                error!(error = ?e, "Error encountered during member counter job execution");
            }
        }
    });
}

async fn process_all_member_counters(
    http: &Http,
    serenity_cache: &serenity::all::Cache,
    db: &PgPool,
    redis: &Client,
    cache: &Cache<GuildId, GuildSettings>,
    last_updated: &mut HashMap<GuildId, Instant>,
) -> anyhow::Result<()> {
    // Query database for all guild IDs that have member counter enabled
    let guild_ids: Vec<GuildId> = sqlx::query_scalar::<_, i64>(
        r"
        SELECT guild_id
        FROM guild_configs
        WHERE (settings->'member_counter'->>'enabled')::boolean = true
        ",
    )
    .fetch_all(db)
    .await
    .map(|rows| rows.into_iter().map(|id| GuildId::new(id as u64)).collect())
    .unwrap_or_else(|e| {
        warn!(error = ?e, "Failed to query active member counter guilds from DB");
        Vec::new()
    });

    if guild_ids.is_empty() {
        trace!("No active member counters to process");
        return Ok(());
    }

    for guild_id in guild_ids {
        // Fetch guild settings from memory/Redis/DB
        let settings = match get_settings(db, redis, cache, guild_id).await {
            Ok(s) => s,
            Err(e) => {
                warn!(%guild_id, error = ?e, "Failed to fetch settings for guild");
                continue;
            }
        };

        let counter_config = match settings.member_counter {
            Some(ref c) if c.enabled => c,
            _ => continue,
        };

        // Check if interval has elapsed for this guild
        let interval_secs = u64::from(counter_config.update_interval_minutes.max(5)) * 60;
        if let Some(last_time) = last_updated.get(&guild_id)
            && last_time.elapsed().as_secs() < interval_secs
        {
            continue; // Not time yet for this guild
        }

        // Process counters for this guild
        if let Err(e) = update_guild_counters(http, serenity_cache, guild_id, counter_config).await
        {
            warn!(%guild_id, error = ?e, "Failed to update member counter channels for guild");
        } else {
            last_updated.insert(guild_id, Instant::now());
        }
    }

    Ok(())
}
