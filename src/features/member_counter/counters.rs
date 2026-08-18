use crate::features::member_counter::types::{CounterType, MemberCounterConfig};
use serenity::all::{Cache, ChannelId, GuildId, Http, RoleId};
use tracing::{info, trace, warn};

#[derive(Debug, Clone)]
pub struct CounterResult {
    pub channel_id: ChannelId,
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
    http: &Http,
    serenity_cache: &Cache,
    guild_id: GuildId,
    config: &MemberCounterConfig,
) -> anyhow::Result<GuildCounts> {
    // Compute guild statistics using Serenity Cache (or HTTP fallback)
    let (total_members, humans_count, bots_count, online_count) =
        if let Some(guild) = serenity_cache.guild(guild_id) {
            let total = guild.member_count;
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
            let partial_guild = guild_id.to_partial_guild_with_counts(http).await?;
            let approx_total = partial_guild.approximate_member_count.unwrap_or(0);
            let approx_online = partial_guild.approximate_presence_count.unwrap_or(0);
            (approx_total, approx_total, 0, approx_online)
        };

    let mut counter_results = Vec::new();

    for counter in &config.counters {
        let channel_id = match counter.channel_id {
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
                count_members_with_role(serenity_cache, guild_id, role_id)
            }
        };

        let target_name = counter.name_template.replace("{count}", &count.to_string());
        let mut name_changed = false;

        // Fetch current channel to check if the name actually changed
        let current_channel = match channel_id.to_channel(http).await {
            Ok(c) => c,
            Err(e) => {
                warn!(%guild_id, %channel_id, error = ?e, "Failed to fetch counter channel");
                continue;
            }
        };

        if let Some(guild_channel) = current_channel.guild() {
            // ONLY send request to Discord if the channel name has changed (avoids rate limits)
            if guild_channel.name == target_name {
                trace!(
                    %guild_id,
                    %channel_id,
                    "Channel name is already up to date"
                );
            } else {
                name_changed = true;
                info!(
                    %guild_id,
                    %channel_id,
                    old_name = %guild_channel.name,
                    new_name = %target_name,
                    "Updating member counter channel name"
                );

                let edit_builder = serenity::all::EditChannel::new().name(&target_name);
                if let Err(e) = channel_id.edit(http, edit_builder).await {
                    warn!(
                        %guild_id,
                        %channel_id,
                        error = ?e,
                        "Failed to update channel name on Discord"
                    );
                }
            }
        }

        // Add this channel's update report to our list!
        counter_results.push(CounterResult {
            channel_id,
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
fn count_members_with_role(serenity_cache: &Cache, guild_id: GuildId, role_id: RoleId) -> u64 {
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
