pub mod utils;
pub mod database;
pub mod message;
pub mod send;

use crate::core::config::{get_guild_ctx, get_settings, GuildCtx};
use crate::types::config::config::LeaveConfig;
use crate::types::config::welcome::WelcomeConfig;
use crate::types::{Data, Error};
use crate::utils::custom_msg::build_custom_message;
use crate::utils::placeholders::replace_welcome_goodbye_placeholders;
use poise::serenity_prelude as serenity;
use serenity::all::{EditMember, GuildChannel, RoleId};
use serenity::{ChannelId, CreateEmbed, CreateMessage};
use std::collections::HashSet;
use tracing::{debug, info, trace, warn};

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

    let msg_payload = message::build_goodbye_message(ctx, *_guild_id, user, member_data_if_available, leave_cfg).await;

    debug!(guild_id, user_id, target_channel = channel_id.get(), "Dispatching goodbye notification message");
    if let Err(e) = channel_id.send_message(&ctx.http, msg_payload).await {
        warn!(error = ?e, guild_id, user_id, target_channel = channel_id.get(), "Failed to send goodbye notification to channel");
    }

    trace!(guild_id, user_id, "Logging member leave record to database");
    database::log_leave_to_db(user_id as i64, guild_id as i64, &data.db).await?;
    Ok(())
}

async fn apply_join_roles(
    ctx: &serenity::Context,
    member: &serenity::all::Member,
    role_ids: &[String],
) -> Result<(), Error> {
    let guild_id = member.guild_id.get();
    let user_id = member.user.id.get();
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

    if let Some(ref role_ids) = config.join_role_ids {
        if let Err(e) = apply_join_roles(ctx, member, role_ids).await {
            warn!(error = ?e, guild_id, user_id, "Failed to completely apply automatic join roles");
        }
    }

    send::send_public_welcome(ctx, member, &config, &context_channel, &gctx, &warning_text).await?;
    send::send_private_welcome(ctx, member, &config, &context_channel, &gctx, &warning_text).await?;

    Ok(())
}