use crate::core::config::guild_ctx::{GuildCtx, get_guild_ctx};
use crate::core::config::state::Error;
use crate::features::join_leave::placeholders::replace_welcome_goodbye_placeholders;
use crate::features::join_leave::types::LeaveConfig;
use crate::features::join_leave::types::WelcomeMessageSettings;
use crate::shared::embed::build_custom_message;
use serenity::all::{ChannelId, CreateEmbed, CreateMessage, Mentionable};
use tracing::{debug, trace, warn};

pub fn build_welcome_message(
    settings: &WelcomeMessageSettings,
    member: &serenity::all::Member,
    channel: &serenity::all::GuildChannel,
    gctx: &GuildCtx,
    warning_text: &str,
    is_dm: bool,
) -> Result<CreateMessage, Error> {
    let user_id = member.user.id.get();
    let guild_id = member.guild_id.get();
    trace!(guild_id, user_id, is_dm, "Compiling welcome notification message template");

    let custom_msg_opt = build_custom_message(
        settings.message.format,
        &settings.message.content,
        &settings.message.embed,
        |text| replace_welcome_goodbye_placeholders(text, gctx, member, channel, None, Some(warning_text)),
    )?;

    Ok(custom_msg_opt.unwrap_or_else(|| {
        debug!(guild_id, user_id, is_dm, "No custom welcome template found; rendering standard layout");
        let base_msg = if is_dm {
            format!("Welcome to the server, {}! We are glad to have you here.", member.user.mention())
        } else {
            format!("Welcome to the server, {}! We are glad to have you here.{}", member.user.mention(), warning_text)
        };
        CreateMessage::new().content(base_msg)
    }))
}

pub fn build_fallback_message(user: &serenity::all::User, member: &Option<serenity::all::Member>) -> CreateMessage {
    let roles_text = format_member_roles(member);
    let embed = CreateEmbed::new()
        .title("Member Left / Kicked")
        .description(format!("**{}** (`{}`) is no longer in the server.", user.name, user.id))
        .field("Roles before leaving", roles_text, false)
        .thumbnail(user.face())
        .color(serenity::all::Color::from_rgb(255, 0, 0))
        .timestamp(serenity::all::Timestamp::now());

    CreateMessage::new().embed(embed)
}

pub async fn build_goodbye_message(
    ctx: &serenity::all::Context,
    guild_id: serenity::all::GuildId,
    user: &serenity::all::User,
    member_data_if_available: &Option<serenity::all::Member>,
    leave_cfg: &LeaveConfig,
) -> CreateMessage {
    let member = if let Some(m) = member_data_if_available { m } else {
        debug!(
            guild_id = guild_id.get(),
            user_id = user.id.get(),
            "No member metadata available in cache; constructing default fallback layout"
        );
        return build_fallback_message(user, &None);
    };

    trace!(
        guild_id = guild_id.get(),
        user_id = user.id.get(),
        "Cached member details available; resolving context details for goodbye message"
    );

    let gctx_res = get_guild_ctx(guild_id, ctx).await;
    let context_ch_res = get_context_channel(ctx, member, leave_cfg.channel_id).await;

    match (gctx_res, context_ch_res) {
        (Ok(gctx), Ok(context_channel)) => {
            let custom = build_custom_message(
                leave_cfg.message.format,
                &leave_cfg.message.content,
                &leave_cfg.message.embed,
                |text| replace_welcome_goodbye_placeholders(text, &gctx, member, &context_channel, None, None),
            ).unwrap_or_else(|e| {
                warn!(
                    error = ?e,
                    guild_id = guild_id.get(),
                    user_id = user.id.get(),
                    "Failed to compile custom leave message template; using fallback layout"
                );
                None
            });

            custom.unwrap_or_else(|| build_fallback_message(user, member_data_if_available))
        }
        (gctx_err, context_err) => {
            warn!(
                gctx_error = ?gctx_err.err(),
                context_error = ?context_err.err(),
                guild_id = guild_id.get(),
                user_id = user.id.get(),
                "Failed to resolve rendering context for leave notification; falling back to default layout"
            );
            build_fallback_message(user, member_data_if_available)
        }
    }
}

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
    public_channel_id_u64: Option<u64>,
) -> Result<serenity::all::GuildChannel, Error> {
    let guild_id = member.guild_id.get();
    trace!(guild_id, "Resolving text channel context for placeholder evaluation");

    if let Some(ch_u64) = public_channel_id_u64 {
        let channel_id = ChannelId::new(ch_u64);
        if let Ok(channel) = channel_id.to_channel(ctx).await
            && let Some(guild_ch) = channel.guild() {
                trace!(guild_id, channel_id = ch_u64, "Resolved configured target channel context");
                return Ok(guild_ch);
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
    Err(std::io::Error::other(
        "Could not resolve a suitable text channel context.",
    )
        .into())
}