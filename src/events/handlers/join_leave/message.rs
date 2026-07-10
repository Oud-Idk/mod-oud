use crate::core::config::{get_guild_ctx, GuildCtx};
use crate::events::handlers::join_leave::utils;
use crate::types::config::config::LeaveConfig;
use crate::types::config::welcome::WelcomeMessageSettings;
use crate::types::Error;
use crate::utils::custom_msg::build_custom_message;
use crate::utils::placeholders::replace_welcome_goodbye_placeholders;
use serenity::all::{CreateEmbed, CreateMessage, Mentionable};
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

    let is_embed = settings.format.as_deref().unwrap_or("embed") == "embed";

    let custom_msg_opt = build_custom_message(
        is_embed,
        settings.content.as_deref(),
        settings.embed.as_ref(),
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
    let roles_text = utils::format_member_roles(member);
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
    let member = match member_data_if_available {
        Some(m) => m,
        None => {
            debug!(
                guild_id = guild_id.get(),
                user_id = user.id.get(),
                "No member metadata available in cache; constructing default fallback layout"
            );
            return build_fallback_message(user, &None);
        }
    };

    trace!(
        guild_id = guild_id.get(),
        user_id = user.id.get(),
        "Cached member details available; resolving context details for goodbye message"
    );

    let gctx_res = get_guild_ctx(guild_id, ctx).await;
    let context_ch_res = utils::get_context_channel(ctx, member, leave_cfg.channel_id.as_deref()).await;

    match (gctx_res, context_ch_res) {
        (Ok(gctx), Ok(context_channel)) => {
            let is_embed = leave_cfg.format.as_deref().unwrap_or("embed") == "embed";

            let custom = build_custom_message(
                is_embed,
                leave_cfg.content.as_deref(),
                leave_cfg.embed.as_ref(),
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