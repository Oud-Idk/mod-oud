use crate::core::config::guild_ctx::get_guild_ctx;
use crate::core::config::settings::get_settings;
use crate::core::config::state::{BotData, Error};
use crate::features::join_leave::{database, log_join_to_db, messages, send};
use anyhow::Result;
use serenity::all::{ChannelId, Context, EditMember, GuildId, Member, RoleId, User};
use std::collections::HashSet;
use tracing::{debug, info, trace, warn};

/// Sends leave message when a member leaves.
///
/// # Errors
/// Returns `Err` when leave event fails to be logged at `PostgreSQL`.
pub async fn send_leave_message(
    ctx: &Context,
    _guild_id: &GuildId,
    user: &User,
    member_data_if_available: &Option<Member>,
    data: &BotData,
) -> Result<()> {
    let guild_id = _guild_id.get();
    let user_id = user.id.get();
    info!(guild_id, user_id, user_name = %user.name, "Member left the guild");

    let settings = get_settings(
        &data.core.db,
        &data.core.redis,
        &data.core.guild_configs_cache,
        guild_id,
    )
    .await?;

    let Some(leave_cfg) = settings.leave.as_ref().filter(|cfg| cfg.enabled) else {
        trace!(
            guild_id,
            user_id, "Leave notifications are disabled; logging departure directly to DB"
        );
        return database::log_leave_to_db(user_id, guild_id, &data.core.db).await;
    };

    let Some(channel_id) = leave_cfg.channel_id.map(|id| ChannelId::new(id)) else {
        warn!(
            guild_id,
            user_id, "Leave notifications are enabled, but target channel ID is missing or invalid"
        );
        return database::log_leave_to_db(user_id, guild_id, &data.core.db).await;
    };

    let msg_payload =
        messages::build_goodbye_message(ctx, *_guild_id, user, member_data_if_available, leave_cfg)
            .await;

    debug!(
        guild_id,
        user_id,
        target_channel = channel_id.get(),
        "Dispatching goodbye notification message"
    );
    if let Err(e) = channel_id.send_message(&ctx.http, msg_payload).await {
        warn!(error = ?e, guild_id, user_id, target_channel = channel_id.get(), "Failed to send goodbye notification to channel");
    }

    trace!(guild_id, user_id, "Logging member leave record to database");
    database::log_leave_to_db(user_id, guild_id, &data.core.db).await?;
    Ok(())
}

async fn apply_join_roles(ctx: &Context, member: &Member, role_ids: &[String]) -> Result<()> {
    let guild_id = member.guild_id.get();
    let user_id = member.user.id.get();
    trace!(
        guild_id,
        user_id, "Evaluating and preparing automatic join roles for member"
    );

    let mut role_set: HashSet<RoleId> = member.roles.iter().copied().collect();
    for role_id in role_ids {
        role_set.insert(RoleId::from(role_id.parse::<u64>()?));
    }

    let merged_roles: Vec<RoleId> = role_set.into_iter().collect();
    let builder = EditMember::new().roles(merged_roles);

    if let Err(e) = member
        .guild_id
        .edit_member(ctx, member.user.id, builder)
        .await
    {
        warn!(error = ?e, guild_id, user_id, "Failed to apply automatic join roles to member");
    } else {
        debug!(
            guild_id,
            user_id, "Successfully assigned automatic join roles to member"
        );
    }
    Ok(())
}

pub async fn handle_member_welcome(ctx: &Context, member: &Member, data: &BotData) -> Result<()> {
    let guild_id = member.guild_id.get();
    let user_id = member.user.id.get();
    trace!(guild_id, user_id, "Executing welcome handler tasks");

    let settings = get_settings(
        &data.core.db,
        &data.core.redis,
        &data.core.guild_configs_cache,
        guild_id,
    )
    .await?;
    let Some(config) = settings.welcome else {
        return Ok(());
    };

    let warning_text = check_alt_status(&member.user);
    let gctx = get_guild_ctx(member.guild_id, ctx).await?;

    let public_channel_id_u64 = config.public.as_ref().and_then(|p| p.channel_id);
    let context_channel = messages::get_context_channel(ctx, member, public_channel_id_u64).await?;

    if let Some(ref role_ids) = config.join_role_ids
        && let Err(e) = apply_join_roles(ctx, member, role_ids).await
    {
        warn!(error = ?e, guild_id, user_id, "Failed to completely apply automatic join roles");
    }

    send::send_public_welcome(ctx, member, &config, &context_channel, &gctx, &warning_text).await?;
    send::send_private_welcome(ctx, member, &config, &context_channel, &gctx, &warning_text)
        .await?;

    Ok(())
}

pub fn check_alt_status(user: &User) -> String {
    let user_id = user.id.get();
    trace!(user_id, "Evaluating account age for alt-status tracking");
    let created_timestamp = user.id.created_at().unix_timestamp();
    let now_timestamp = serenity::all::Timestamp::now().unix_timestamp();
    let age_in_days = (now_timestamp - created_timestamp) / 86400;

    if age_in_days < 3 {
        debug!(
            user_id,
            age_in_days, "New account detected (less than 3 days old); creating alert text"
        );
        format!("\n\n⚠️ **WARNING:** This account is very new! Created {age_in_days} days ago.")
    } else {
        trace!(user_id, age_in_days, "Account age is normal");
        String::new()
    }
}

/// Fanout events for member join handling.
///
/// # Errors
/// Propagates errors from `handle_member_welcome` or `log_join_to_db`.
pub async fn handle_member_join(
    ctx: &Context,
    member: &Member,
    data: &BotData,
) -> Result<(), Error> {
    handle_member_welcome(ctx, member, data).await?;
    log_join_to_db(member.user.id.get(), member.guild_id.get(), data).await?;
    Ok(())
}
