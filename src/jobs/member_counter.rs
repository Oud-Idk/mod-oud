use crate::core::config::get_settings;
use crate::types::config::config::{CounterType, GuildSettings, MemberCounterConfig};
use fred::prelude::*;
use poise::serenity_prelude as serenity;
use sqlx::PgPool;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::time::{interval, Duration, Instant};
use tracing::{debug, error, info, trace, warn};

/// Starts the member counter background task loop.
pub fn start_member_counter_job(
    http: Arc<serenity::Http>,
    serenity_cache: Arc<serenity::Cache>,
    db: PgPool,
    redis: Client,
    cache: moka::future::Cache<i64, GuildSettings>,
) {
    tokio::spawn(async move {
        info!("Member counter background job started");

        let mut last_updated: HashMap<i64, Instant> = HashMap::new();

        let mut timer = interval(Duration::from_secs(60));

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
    http: &serenity::Http,
    serenity_cache: &serenity::Cache,
    db: &PgPool,
    redis: &Client,
    cache: &moka::future::Cache<i64, GuildSettings>,
    last_updated: &mut HashMap<i64, Instant>,
) -> anyhow::Result<()> {
    // Query database for all guild IDs that have member counter enabled
    let guild_ids: Vec<i64> = sqlx::query_scalar(
        r#"
        SELECT guild_id
        FROM guild_configs
        WHERE (settings->'member_counter'->>'enabled')::boolean = true
        "#,
    )
        .fetch_all(db)
        .await
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
                warn!(guild_id, error = ?e, "Failed to fetch settings for guild");
                continue;
            }
        };

        let counter_config = match settings.member_counter {
            Some(ref c) if c.enabled => c,
            _ => continue,
        };

        // Check if interval has elapsed for this guild
        let interval_secs = (counter_config.update_interval_minutes.max(5) as u64) * 60;
        if let Some(last_time) = last_updated.get(&guild_id) {
            if last_time.elapsed().as_secs() < interval_secs {
                continue; // Not time yet for this guild
            }
        }

        // Process counters for this guild
        if let Err(e) = update_guild_counters(http, serenity_cache, guild_id, counter_config).await {
            warn!(guild_id, error = ?e, "Failed to update member counter channels for guild");
        } else {
            last_updated.insert(guild_id, Instant::now());
        }
    }

    Ok(())
}

async fn update_guild_counters(
    http: &serenity::Http,
    serenity_cache: &serenity::Cache,
    guild_id: i64,
    config: &MemberCounterConfig,
) -> anyhow::Result<()> {
    let serenity_guild_id = serenity::GuildId::new(guild_id as u64);

    // Compute guild statistics using Serenity Cache (or HTTP fallback)
    let (total_members, humans_count, bots_count, online_count) =
        if let Some(guild) = serenity_cache.guild(serenity_guild_id) {
            let total = guild.member_count as u64;
            let mut humans = 0u64;
            let mut bots = 0u64;

            for member in guild.members.values() {
                if member.user.bot {
                    bots += 1;
                } else {
                    humans += 1;
                }
            }

            let online = guild
                .presences
                .values()
                .filter(|p| {
                    p.status != serenity::OnlineStatus::Offline
                        && p.status != serenity::OnlineStatus::Invisible
                })
                .count() as u64;

            (total, humans, bots, online)
        } else {
            // Fallback via HTTP if guild is not in bot cache
            let partial_guild = serenity_guild_id.to_partial_guild_with_counts(http).await?;
            let approx_total = partial_guild.approximate_member_count.unwrap_or(0);
            let approx_online = partial_guild.approximate_presence_count.unwrap_or(0);
            (approx_total, approx_total, 0, approx_online)
        };

    for counter in &config.counters {
        let channel_id_u64 = match counter.channel_id.trim().parse::<u64>() {
            Ok(id) if id > 0 => id,
            _ => continue, // Skip empty/invalid channel IDs
        };

        let count = match counter.counter_type {
            CounterType::TotalMembers => total_members,
            CounterType::HumansOnly => humans_count,
            CounterType::BotsOnly => bots_count,
            CounterType::OnlineMembers => online_count,
            CounterType::RoleCount => {
                let role_id_str = counter.role_id.as_deref().unwrap_or_default();
                count_members_with_role(serenity_cache, serenity_guild_id, role_id_str)
            }
        };


        let target_name = counter.name_template.replace("{count}", &count.to_string());

        let channel_id = serenity::ChannelId::new(channel_id_u64);

        // Fetch current channel to check if the name actually changed
        let current_channel = match channel_id.to_channel(http).await {
            Ok(c) => c,
            Err(e) => {
                warn!(guild_id, channel_id = %channel_id, error = ?e, "Failed to fetch counter channel");
                continue;
            }
        };

        if let Some(guild_channel) = current_channel.guild() {
            // ONLY send request to Discord if the channel name has changed (avoids rate limits)
            if guild_channel.name != target_name {
                info!(
                    guild_id,
                    channel_id = %channel_id,
                    old_name = %guild_channel.name,
                    new_name = %target_name,
                    "Updating member counter channel name"
                );

                let edit_builder = serenity::EditChannel::new().name(&target_name);
                if let Err(e) = channel_id.edit(http, edit_builder).await {
                    warn!(
                        guild_id,
                        channel_id = %channel_id,
                        error = ?e,
                        "Failed to update channel name on Discord"
                    );
                }
            } else {
                trace!(
                    guild_id,
                    channel_id = %channel_id,
                    "Channel name is already up to date"
                );
            }
        }
    }

    Ok(())
}

/// Helper function to count guild members with a specific role ID.
fn count_members_with_role(
    serenity_cache: &serenity::Cache,
    guild_id: serenity::GuildId,
    role_id_str: &str,
) -> u64 {
    let Ok(role_id_u64) = role_id_str.parse::<u64>() else {
        return 0;
    };
    let role_id = serenity::RoleId::new(role_id_u64);

    if let Some(guild) = serenity_cache.guild(guild_id) {
        guild
            .members
            .values()
            .filter(|m| m.roles.contains(&role_id))
            .count() as u64
    } else {
        0
    }
}
