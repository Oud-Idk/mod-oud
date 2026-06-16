use crate::core::config::replace_welcome_goodbye_placeholders;
use crate::types::config::welcome::WelcomeMessageSettings;
use crate::types::Error;
use crate::utils::custom_msg::build_custom_message;
use serenity::all::{ChannelId, CreateMessage, Mentionable};

/// Resolves a member's role list to a comma-separated mention string.
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

/// Helper to safely resolve a text channel to populate the placeholder evaluation context.
/// Defaults to the configured welcome channel, or falls back to any visible text channel.
pub async fn get_context_channel(
    ctx: &serenity::all::Context,
    member: &serenity::all::Member,
    public_channel_id_str: Option<&str>,
) -> Result<serenity::all::GuildChannel, Error> {
    if let Some(ch_str) = public_channel_id_str {
        if let Ok(id_u64) = ch_str.parse::<u64>() {
            let channel_id = ChannelId::new(id_u64);
            if let Ok(channel) = channel_id.to_channel(ctx).await {
                if let Some(guild_ch) = channel.guild() {
                    return Ok(guild_ch);
                }
            }
        }
    }

    // Fallback search using ChannelType enum to locate any standard guild text channel
    let channels = member.guild_id.channels(&ctx.http).await?;
    for (_, channel) in channels {
        if channel.kind == serenity::all::ChannelType::Text {
            return Ok(channel);
        }
    }

    Err(std::io::Error::new(
        std::io::ErrorKind::Other,
        "Could not resolve a suitable text channel context.",
    )
        .into())
}

/// Checks the creation date of an account and returns a warning string if it is newer than 3 days.
pub fn check_alt_status(user: &serenity::all::User) -> String {
    let created_timestamp = user.id.created_at().unix_timestamp();
    let now_timestamp = serenity::all::Timestamp::now().unix_timestamp();
    let age_in_days = (now_timestamp - created_timestamp) / 86400;

    if age_in_days < 3 {
        format!(
            "\n\n⚠️ **WARNING:** This account is very new! Created {} days ago.",
            age_in_days
        )
    } else {
        String::new()
    }
}

/// Helper to compile the plaintext content or parsed embed payload for a welcome configuration
pub fn build_welcome_message(
    settings: &WelcomeMessageSettings,
    member: &serenity::all::Member,
    channel: &serenity::all::GuildChannel,
    gctx: &crate::core::config::GuildCtx,
    warning_text: &str,
    is_dm: bool,
) -> Result<CreateMessage, Error> {
    let is_embed = settings.format.as_deref().unwrap_or("embed") == "embed";

    let custom_msg_opt = build_custom_message(
        is_embed,
        settings.content.as_ref(),
        settings.embed.as_ref(),
        |text| replace_welcome_goodbye_placeholders(text, gctx, member, channel, None, Some(warning_text)),
    )?;

    // If we got a built message from the helper, use it. Otherwise, fallback.
    Ok(custom_msg_opt.unwrap_or_else(|| {
        let base_msg = if is_dm {
            format!("Welcome to the server, {}! We are glad to have you here.", member.user.mention())
        } else {
            format!("Welcome to the server, {}! We are glad to have you here.{}", member.user.mention(), warning_text)
        };
        CreateMessage::new().content(base_msg)
    }))
}