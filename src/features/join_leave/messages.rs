use crate::core::config::guild_ctx::{GuildCtx, get_guild_ctx};
use crate::core::config::settings::get_settings;
use crate::core::config::state::{BotData, Error};
use crate::features::join_leave::database;
use crate::features::join_leave::placeholders::replace_welcome_goodbye_placeholders;
use crate::features::join_leave::types::LeaveConfig;
use crate::features::join_leave::types::MessageSettings;
use crate::shared::embed::build_custom_message;
use serenity::all::{ChannelId, ChannelType, Color, Context, CreateAttachment, CreateEmbed, CreateMessage, GuildChannel, GuildId, Member, Mentionable, Timestamp, User};
use tracing::{debug, info, trace, warn};
use crate::features::join_leave::image::generate_leave_card;

pub fn build_welcome_message(
    settings: &MessageSettings,
    member: &Member,
    channel: &GuildChannel,
    gctx: &GuildCtx,
    warning_text: &str,
    is_dm: bool,
) -> Result<CreateMessage, Error> {
    let user_id = member.user.id.get();
    let guild_id = member.guild_id.get();
    trace!(
        guild_id,
        user_id, is_dm, "Compiling welcome notification message template"
    );

    let custom_msg_opt = build_custom_message(
        settings.message.format,
        &settings.message.content,
        &settings.message.embed,
        |text| {
            replace_welcome_goodbye_placeholders(
                text,
                gctx,
                member,
                channel,
                None,
                Some(warning_text),
            )
        },
    )?;

    Ok(custom_msg_opt.unwrap_or_else(|| {
        debug!(
            guild_id,
            user_id, is_dm, "No custom welcome template found; rendering standard layout"
        );
        let base_msg = if is_dm {
            format!(
                "Welcome to the server, {}! We are glad to have you here.",
                member.user.mention()
            )
        } else {
            format!(
                "Welcome to the server, {}! We are glad to have you here.{}",
                member.user.mention(),
                warning_text
            )
        };
        CreateMessage::new().content(base_msg)
    }))
}

pub fn build_fallback_message(
    user: &User,
    member: Option<&Member>,
) -> CreateMessage {
    let roles_text = format_member_roles(member);
    let embed = CreateEmbed::new()
        .title("Member Left / Kicked")
        .description(format!(
            "**{}** (`{}`) is no longer in the server.",
            user.name, user.id
        ))
        .field("Roles before leaving", roles_text, false)
        .thumbnail(user.face())
        .color(Color::from_rgb(255, 0, 0))
        .timestamp(Timestamp::now());

    CreateMessage::new().embed(embed)
}

pub async fn build_goodbye_message(
    ctx: &Context,
    guild_id: GuildId,
    user: &User,
    member_data_if_available: Option<&Member>,
    leave_cfg: &LeaveConfig,
) -> CreateMessage {
    let Some(member) = member_data_if_available else {
        debug!(
            %guild_id,
            user_id = user.id.get(),
            "No member metadata available in cache; constructing default fallback layout"
        );
        return build_fallback_message(user, None);
    };

    trace!(
        %guild_id,
        user_id = user.id.get(),
        "Cached member details available; resolving context details for goodbye message"
    );

    let gctx_res = get_guild_ctx(guild_id, ctx).await;
    let context_ch_res = get_context_channel(ctx, member, leave_cfg.message.channel_id).await;

    match (gctx_res, context_ch_res) {
        (Ok(gctx), Ok(context_channel)) => {
            let custom = build_custom_message(
                leave_cfg.message.message.format,
                &leave_cfg.message.message.content,
                &leave_cfg.message.message.embed,
                |text| {
                    replace_welcome_goodbye_placeholders(
                        text,
                        &gctx,
                        member,
                        &context_channel,
                        None,
                        None,
                    )
                },
            )
            .unwrap_or_else(|e| {
                warn!(
                    error = ?e,
                    %guild_id,
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
                %guild_id,
                user_id = user.id.get(),
                "Failed to resolve rendering context for leave notification; falling back to default layout"
            );
            build_fallback_message(user, member_data_if_available)
        }
    }
}

pub fn format_member_roles(member_data: Option<&Member>) -> String {
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
    ctx: &Context,
    member: &Member,
    public_channel_id: Option<ChannelId>,
) -> Result<GuildChannel, Error> {
    let guild_id = member.guild_id;
    trace!(%guild_id, "Resolving text channel context for placeholder evaluation");

    if let Some(ch_id) = public_channel_id
        && let Ok(channel) = ch_id.to_channel(ctx).await
        && let Some(guild_ch) = channel.guild()
    {
        trace!(%guild_id, channel_id = %ch_id, "Resolved configured target channel context");
        return Ok(guild_ch);
    }

    debug!(%guild_id, "No valid public welcome channel provided; scanning for any standard text channel context");
    let channels = member.guild_id.channels(&ctx.http).await?;
    for (_, channel) in channels {
        if channel.kind == ChannelType::Text {
            trace!(%guild_id, fallback_channel_id = channel.id.get(), "Fallback text channel context resolved");
            return Ok(channel);
        }
    }

    warn!(%guild_id, "Failed to resolve any valid text channel context in guild");
    Err(std::io::Error::other("Could not resolve a suitable text channel context.").into())
}

/// Sends leave message when a member leaves.
///
/// # Errors
/// Returns `Err` when leave event fails to be logged at `PostgreSQL`.
pub async fn send_leave_message(
    ctx: &Context,
    guild_id: GuildId,
    user: &User,
    member_data_if_available: Option<&Member>,
    data: &BotData,
) -> anyhow::Result<()> {
    let user_id = user.id;
    info!(%guild_id, %user_id, user_name = %user.name, "Member left the guild");

    let settings = get_settings(
        &data.core.db,
        &data.core.redis,
        &data.core.guild_configs_cache,
        guild_id,
    )
    .await?;

    let Some(leave_cfg) = settings.leave.as_ref().filter(|cfg| cfg.message.enabled.unwrap_or(false)) else {
        trace!(
            %guild_id,
            %user_id, "Leave notifications are disabled; logging departure directly to DB"
        );
        return database::log_leave_to_db(user_id, guild_id, &data.core.db).await;
    };

    let Some(channel_id) = leave_cfg.message.channel_id else {
        warn!(
            %guild_id,
            %user_id, "Leave notifications are enabled, but target channel ID is missing or invalid"
        );
        return database::log_leave_to_db(user_id, guild_id, &data.core.db).await;
    };

    let mut msg_payload =
        build_goodbye_message(ctx, guild_id, user, member_data_if_available, leave_cfg)
            .await;

    if leave_cfg.message.send_image {
        let display_name = user.global_name.as_deref().unwrap_or(&user.name);

        let (guild_name, member_count) = guild_id
            .to_guild_cached(&ctx.cache)
            .map(|g| (g.name.clone(), g.member_count))
            .unwrap_or_else(|| ("the server".to_string(), 0));

        if let Some(bytes) = generate_leave_card(
            display_name,
            &user.face(),
            member_count,
            &guild_name,
            &leave_cfg.message.image_style,
        )
            .await
        {
            msg_payload = msg_payload.add_file(CreateAttachment::bytes(bytes, "goodbye.png"));
        }
    }

    debug!(
        %guild_id,
        %user_id,
        target_channel = channel_id.get(),
        "Dispatching goodbye notification message"
    );
    if let Err(e) = channel_id.send_message(&ctx.http, msg_payload).await {
        warn!(error = ?e, %guild_id, %user_id, target_channel = channel_id.get(), "Failed to send goodbye notification to channel");
    }

    trace!(%guild_id, %user_id, "Logging member leave record to database");
    database::log_leave_to_db(user_id, guild_id, &data.core.db).await?;
    Ok(())
}