use crate::core::config::settings::get_settings;
use crate::features::member_counter::counters::update_guild_counters;
use poise::serenity_prelude as serenity;
use crate::{Context, Error};

/// Manage member counter channels for this server.
#[poise::command(
    slash_command,
    guild_only,
    required_permissions = "MANAGE_GUILD",
    subcommands("sync")
)]
pub async fn counters(_ctx: Context<'_>) -> Result<(), Error> {
    // Parent command function acts as the container for subcommands.
    // If someone runs just `/counters`, Poise handles showing subcommands automatically!
    Ok(())
}

/// Force sync all member counter channels immediately.
#[poise::command(slash_command, guild_only)]
pub async fn sync(ctx: Context<'_>) -> Result<(), Error> {
    ctx.defer_ephemeral().await?;

    let guild_id_u64 = match ctx.guild_id() {
        Some(id) => id.get(),
        None => {
            ctx.say("This command can only be used in a server.").await?;
            return Ok(());
        }
    };
    let guild_id_i64 = guild_id_u64 as i64;

    let data = ctx.data();

    let settings = get_settings(&data.db, &data.redis, &data.guild_configs, guild_id_i64).await?;

    let counter_config = match settings.member_counter {
        Some(ref c) if c.enabled => c,
        _ => {
            ctx.say("❌ Member counters are currently disabled or not configured on this server.").await?;
            return Ok(());
        }
    };

    let http = ctx.serenity_context().http.clone();
    let cache = ctx.serenity_context().cache.clone();

    match update_guild_counters(&http, &cache, guild_id_i64, counter_config).await {
        Ok(counts) => {
            let mut response = format!(
                "✅ **Member counters synchronized!**\n\n\
                📊 **Server Overview:**\n\
                • 👥 **Total Members:** {}\n\
                • 🧑 **Humans:** {}\n\
                • 🤖 **Bots:** {}\n\
                • 🟢 **Online:** {}\n\n\
                🏷️ **Channels Evaluated:**\n",
                counts.total_members,
                counts.humans_count,
                counts.bots_count,
                counts.online_count
            );

            if counts.counters.is_empty() {
                response.push_str("*(No active counter channels found)*");
            } else {
                for counter in counts.counters {
                    let status_tag = if counter.name_changed {
                        "✨ Updated"
                    } else {
                        "👌 Up to date"
                    };

                    response.push_str(&format!(
                        "• <#{}> ➔ `{}` ({})\n",
                        counter.channel_id,
                        counter.new_name,
                        status_tag
                    ));
                }
            }

            ctx.say(response).await?;
        }
        Err(e) => {
            tracing::error!(error = ?e, guild_id = guild_id_u64, "Failed to force sync counters via command");
            ctx.say("❌ Failed to update member counters due to an internal error.").await?;
        }
    }

    Ok(())
}