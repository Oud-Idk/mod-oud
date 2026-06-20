use crate::core::config::{get_guild_ctx, get_settings};
use crate::events::handlers::join_leave::{database, utils};
use crate::types::config::welcome::WelcomeConfig;
use crate::types::{Data, Error};
use crate::utils::custom_msg::build_custom_message;
use crate::utils::placeholders::replace_welcome_goodbye_placeholders;
use poise::serenity_prelude as serenity;
use serenity::all::{EditMember, RoleId};
use serenity::{ChannelId, CreateEmbed, CreateMessage};
use std::collections::HashSet;
use tracing::{debug, error, info, trace, warn};

pub async fn on_member_join(
    ctx: &serenity::Context,
    member: &serenity::all::Member,
    data: &Data,
) -> Result<(), Error> {
    let guild_id = member.guild_id.get();
    let user_id = member.user.id.get();
    info!(guild_id, user_id, user_name = %member.user.name, "Member joined the guild");

    let settings = get_settings(&data.db, &data.redis, &data.guild_configs, guild_id as i64).await?;

    if let Some(welcome_config) = settings.welcome {
        trace!(guild_id, user_id, "Welcome configuration detected; launching welcome routine");
        if let Err(e) = handle_member_welcome(ctx, member, welcome_config).await {
            warn!(
                error = ?e,
                guild_id,
                user_id,
                user_name = %member.user.name,
                "Error processing welcome routine for member"
            );
        }
    } else {
        debug!(guild_id, "No welcome configuration exists for this guild");
    }

    trace!(guild_id, user_id, "Logging member join record to the database");
    database::log_join_to_db(user_id as i64, guild_id as i64, data).await?;

    Ok(())
}

pub async fn on_member_leave(
    ctx: &serenity::Context,
    _guild_id: &serenity::GuildId,
    user: &serenity::User,
    member_data_if_available: &Option<serenity::Member>,
    data: &Data,
) -> Result<(), Error> {
    let guild_id = _guild_id.get();
    let user_id = user.id.get();
    info!(guild_id, user_id, user_name = %user.name, "Member left the guild");

    let settings = get_settings(&data.db, &data.redis, &data.guild_configs, guild_id as i64).await?;

    let Some(leave_cfg) = settings.leave.as_ref().filter(|cfg| cfg.enabled.unwrap_or(false)) else {
        trace!(guild_id, user_id, "Leave notifications are disabled; logging departure directly to DB");
        return database::log_leave_to_db(user_id as i64, guild_id as i64, &data.db).await;
    };

    let Some(channel_id) = leave_cfg.channel_id.as_ref().and_then(|id| id.parse::<u64>().ok().map(ChannelId::new)) else {
        warn!(guild_id, user_id, "Leave notifications are enabled, but target channel ID is missing or invalid");
        return database::log_leave_to_db(user_id as i64, guild_id as i64, &data.db).await;
    };

    let msg_payload = match member_data_if_available {
        Some(member) => {
            trace!(guild_id, user_id, "Cached member details available; resolving context details for goodbye message");
            let gctx_res = get_guild_ctx(_guild_id.clone(), ctx).await;
            let context_ch_res = utils::get_context_channel(ctx, member, leave_cfg.channel_id.as_deref()).await;

            match (gctx_res, context_ch_res) {
                (Ok(gctx), Ok(context_channel)) => {
                    let is_embed = leave_cfg.format.as_deref().unwrap_or("embed") == "embed";

                    let custom = build_custom_message(
                        is_embed,
                        leave_cfg.content.as_ref(),
                        leave_cfg.embed.as_ref(),
                        |text| replace_welcome_goodbye_placeholders(text, &gctx, member, &context_channel, None, None),
                    ).unwrap_or_else(|e| {
                        warn!(error = ?e, guild_id, user_id, "Failed to compile custom leave message template; using fallback layout");
                        None
                    });

                    Some(custom.unwrap_or_else(|| build_fallback_message(user, member_data_if_available)))
                }
                (gctx_err, context_err) => {
                    warn!(
                        gctx_error = ?gctx_err.err(),
                        context_error = ?context_err.err(),
                        guild_id,
                        user_id,
                        "Failed to resolve rendering context for leave notification; falling back to default layout"
                    );
                    Some(build_fallback_message(user, member_data_if_available))
                }
            }
        }
        None => {
            debug!(guild_id, user_id, "No member metadata available in cache; constructing default fallback layout");
            Some(build_fallback_message(user, &None))
        }
    };

    if let Some(builder) = msg_payload {
        debug!(guild_id, user_id, target_channel = channel_id.get(), "Dispatching goodbye notification message");
        if let Err(e) = channel_id.send_message(&ctx.http, builder).await {
            warn!(error = ?e, guild_id, user_id, target_channel = channel_id.get(), "Failed to send goodbye notification to channel");
        }
    }

    trace!(guild_id, user_id, "Logging member leave record to database");
    database::log_leave_to_db(user_id as i64, guild_id as i64, &data.db).await?;
    Ok(())
}

async fn handle_member_welcome(
    ctx: &serenity::Context,
    member: &serenity::all::Member,
    config: WelcomeConfig,
) -> Result<(), Error> {
    let guild_id = member.guild_id.get();
    let user_id = member.user.id.get();
    trace!(guild_id, user_id, "Executing welcome handler tasks");

    let warning_text = utils::check_alt_status(&member.user);
    let gctx = get_guild_ctx(member.guild_id, ctx).await?;

    let public_channel_id_str = config.public.as_ref().and_then(|p| p.channel_id.as_deref());
    let context_channel = utils::get_context_channel(ctx, member, public_channel_id_str).await?;

    if let Some(role_ids) = config.join_role_ids {
        trace!(guild_id, user_id, "Evaluating and preparing automatic join roles for member");
        let mut role_set: HashSet<RoleId> = member.roles.iter().copied().collect();
        for role_id in role_ids {
            role_set.insert(RoleId::from(role_id.parse::<u64>()?));
        }
        let merged_roles: Vec<RoleId> = role_set.into_iter().collect();
        let builder = EditMember::new().roles(merged_roles);
        if let Err(e) = member.guild_id.edit_member(ctx, member.user.id, builder).await {
            warn!(error = ?e, guild_id, user_id, "Failed to apply automatic join roles to member");
        } else {
            debug!(guild_id, user_id, "Successfully assigned automatic join roles to member");
        }
    }

    if let Some(public) = config.public.filter(|p| p.enabled.unwrap_or(false)) {
        if let Some(ch_str) = public.channel_id.as_ref().and_then(|id| id.parse::<u64>().ok()) {
            let channel_id = ChannelId::new(ch_str);
            trace!(guild_id, user_id, target_channel = ch_str, "Assembling public welcome message layout");
            match utils::build_welcome_message(&public, member, &context_channel, &gctx, &warning_text, false) {
                Ok(builder) => {
                    if let Err(e) = channel_id.send_message(&ctx.http, builder).await {
                        warn!(error = ?e, guild_id, user_id, target_channel = ch_str, "Failed to send public welcome message to channel");
                    } else {
                        debug!(guild_id, user_id, target_channel = ch_str, "Public welcome message sent successfully");
                    }
                }
                Err(e) => {
                    warn!(error = ?e, guild_id, user_id, "Failed to compile public welcome layout template");
                }
            }
        }
    }

    if let Some(private) = config.private.filter(|p| p.enabled.unwrap_or(false)) {
        trace!(guild_id, user_id, "Establishing private DM context for welcome message");
        match member.user.create_dm_channel(&ctx.http).await {
            Ok(dm_channel) => {
                match utils::build_welcome_message(&private, member, &context_channel, &gctx, &warning_text, true) {
                    Ok(builder) => {
                        if let Err(e) = dm_channel.send_message(&ctx.http, builder).await {
                            warn!(error = ?e, guild_id, user_id, "Failed to send private DM welcome message to user");
                        } else {
                            debug!(guild_id, user_id, "Private DM welcome message sent successfully");
                        }
                    }
                    Err(e) => {
                        warn!(error = ?e, guild_id, user_id, "Failed to compile private DM welcome layout template");
                    }
                }
            }
            Err(e) => {
                warn!(error = ?e, guild_id, user_id, "Failed to establish DM channel with newly joined user");
            }
        }
    }

    Ok(())
}

fn build_fallback_message(user: &serenity::User, member: &Option<serenity::Member>) -> CreateMessage {
    let roles_text = utils::format_member_roles(member);
    let embed = CreateEmbed::new()
        .title("Member Left / Kicked")
        .description(format!("**{}** (`{}`) is no longer in the server.", user.name, user.id))
        .field("Roles before leaving", roles_text, false)
        .thumbnail(user.face())
        .color(serenity::Color::from_rgb(255, 0, 0))
        .timestamp(serenity::Timestamp::now());

    CreateMessage::new().embed(embed)
}