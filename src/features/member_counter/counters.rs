use crate::features::member_counter::types::{CounterType, MemberCounterConfig};
use tracing::{info, trace, warn};

#[derive(Debug, Clone)]
pub struct CounterResult {
    pub channel_id: u64,
    pub counter_type: CounterType,
    pub count: u64,
    pub new_name: String,
    pub name_changed: bool,
}

#[derive(Debug, Clone)]
pub struct GuildCounts {
    pub total_members: u64,
    pub humans_count: u64,
    pub bots_count: u64,
    pub online_count: u64,
    pub counters: Vec<CounterResult>,
}

pub async fn update_guild_counters(
    http: &serenity::all::Http,
    serenity_cache: &serenity::all::Cache,
    guild_id: i64,
    config: &MemberCounterConfig,
) -> anyhow::Result<GuildCounts> {
    let serenity_guild_id = serenity::all::GuildId::new(guild_id as u64);

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
                    p.status != serenity::all::OnlineStatus::Offline
                        && p.status != serenity::all::OnlineStatus::Invisible
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

    let mut counter_results = Vec::new();

    for counter in &config.counters {
        let channel_id_u64 = match counter.channel_id {
            Some(id) => id,
            _ => continue, // Skip empty/invalid channel IDs
        };

        let count = match counter.counter_type {
            CounterType::TotalMembers => total_members,
            CounterType::HumansOnly => humans_count,
            CounterType::BotsOnly => bots_count,
            CounterType::OnlineMembers => online_count,
            CounterType::RoleCount => {
                let role_id = counter.role_id.unwrap_or_default();
                count_members_with_role(serenity_cache, serenity_guild_id, role_id)
            }
        };

        let target_name = counter.name_template.replace("{count}", &count.to_string());
        let channel_id = serenity::all::ChannelId::new(channel_id_u64);
        let mut name_changed = false;

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
                name_changed = true;
                info!(
                    guild_id,
                    channel_id = %channel_id,
                    old_name = %guild_channel.name,
                    new_name = %target_name,
                    "Updating member counter channel name"
                );

                let edit_builder = serenity::all::EditChannel::new().name(&target_name);
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

        // Add this channel's update report to our list!
        counter_results.push(CounterResult {
            channel_id: channel_id_u64,
            counter_type: counter.counter_type.clone(), // Assuming CounterType implements Clone!
            count,
            new_name: target_name,
            name_changed,
        });
    }

    // Wrap it all up in a pretty package and return! 🎁
    Ok(GuildCounts {
        total_members,
        humans_count,
        bots_count,
        online_count,
        counters: counter_results,
    })
}

/// Helper function to count guild members with a specific role ID.
fn count_members_with_role(
    serenity_cache: &serenity::all::Cache,
    guild_id: serenity::all::GuildId,
    role_id: u64,
) -> u64 {
    let role_id = serenity::all::RoleId::new(role_id);

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