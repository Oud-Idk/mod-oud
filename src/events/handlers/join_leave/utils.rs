use crate::core::config::GuildCtx;
use crate::shared::embed::build_custom_message;
use crate::shared::placeholders::replace_welcome_goodbye_placeholders;
use crate::types::config::welcome::WelcomeMessageSettings;
use crate::types::Error;
use serenity::all::{ChannelId, CreateMessage, Mentionable};
use tracing::{debug, trace, warn};

pub fn format_member_roles(member_data: &Option<serenity::all::Member>) -> String {
    let Some(member) = member_data else {
        return "Unknown (User was not in bot cache)".to_string();
    };

    if member.roles.is_empty() {
        "None".to_string()
    } else {
        member
            .roles
            .iter()
            .map(|role_id| role_id.mention().to_string())
            .collect::<Vec<String>>()
            .join(", ")
    }
}

pub async fn get_context_channel(
    ctx: &serenity::all::Context,
    member: &serenity::all::Member,
    public_channel_id_str: Option<&str>,
) -> Result<serenity::all::GuildChannel, Error> {
    let guild_id = member.guild_id.get();
    trace!(guild_id, "Resolving text channel context for placeholder evaluation");

    if let Some(ch_str) = public_channel_id_str {
        if let Ok(id_u64) = ch_str.parse::<u64>() {
            let channel_id = ChannelId::new(id_u64);
            if let Ok(channel) = channel_id.to_channel(ctx).await {
                if let Some(guild_ch) = channel.guild() {
                    trace!(guild_id, channel_id = id_u64, "Resolved configured target channel context");
                    return Ok(guild_ch);
                }
            }
        }
    }

    debug!(guild_id, "No valid public welcome channel provided; scanning for any standard text channel context");
    let channels = member.guild_id.channels(&ctx.http).await?;
    for (_, channel) in channels {
        if channel.kind == serenity::all::ChannelType::Text {
            trace!(guild_id, fallback_channel_id = channel.id.get(), "Fallback text channel context resolved");
            return Ok(channel);
        }
    }

    warn!(guild_id, "Failed to resolve any valid text channel context in guild");
    Err(std::io::Error::new(
        std::io::ErrorKind::Other,
        "Could not resolve a suitable text channel context.",
    )
        .into())
}

pub fn check_alt_status(user: &serenity::all::User) -> String {
    let user_id = user.id.get();
    trace!(user_id, "Evaluating account age for alt-status tracking");
    let created_timestamp = user.id.created_at().unix_timestamp();
    let now_timestamp = serenity::all::Timestamp::now().unix_timestamp();
    let age_in_days = (now_timestamp - created_timestamp) / 86400;

    if age_in_days < 3 {
        debug!(user_id, age_in_days, "New account detected (less than 3 days old); creating alert text");
        format!(
            "\n\n⚠️ **WARNING:** This account is very new! Created {} days ago.",
            age_in_days
        )
    } else {
        trace!(user_id, age_in_days, "Account age is normal");
        String::new()
    }
}

