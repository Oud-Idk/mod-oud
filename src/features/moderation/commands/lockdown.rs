use crate::features::moderation::{ActionType, lockdown, log_moderation_action};
use crate::shared::command_context::GuildMetadata;
use crate::{Context, Error};
use fred::prelude::*;
use serde::{Deserialize, Serialize};
use serenity::all::{
    ChannelId, GuildChannel, GuildId, PermissionOverwrite, PermissionOverwriteType, Permissions,
    RoleId,
};
use tracing::{info, trace, warn};

/// Lock down a text channel, preventing members from sending messages.
#[poise::command(slash_command, required_permissions = "MANAGE_CHANNELS", guild_only)]
pub async fn lock(
    ctx: Context<'_>,
    #[description = "The channel to lock down (defaults to current channel)"] channel: Option<
        GuildChannel,
    >,
    #[description = "Reason for the lockdown"] reason: Option<String>,
) -> Result<(), Error> {
    let caller_id = ctx.author().id.get();
    info!(caller_id, "Invoked lock command");

    let meta = GuildMetadata::extract(&ctx)?;
    let target_channel = lockdown::resolve_target_channel(&ctx, channel).await?;
    let target_channel_id = target_channel.id.get();
    let everyone_role_id = RoleId::new(meta.id.get());

    // Snapshot current state before mutating it, so unlock can restore precisely.
    lockdown::save_pre_lockdown_state(meta.id, &target_channel, everyone_role_id, &ctx.data()).await?;

    let overwrite = lockdown::calculate_lockdown_overwrite(&target_channel, everyone_role_id);
    target_channel
        .id
        .create_permission(ctx.http(), overwrite)
        .await?;

    let reason_str = reason.as_deref().unwrap_or("No reason provided");

    ctx.say(format!(
        "🔒 <#{}> has been locked down. \n**Reason:** {}",
        target_channel.id, reason_str
    ))
        .await?;

    log_action(
        &ctx,
        meta.id,
        target_channel_id,
        ActionType::Lock,
        Some(reason_str),
    )
        .await?;

    info!(caller_id, target_channel_id, "Channel locked down successfully");
    Ok(())
}

/// Unlock a previously locked text channel.
#[poise::command(slash_command, required_permissions = "MANAGE_CHANNELS", guild_only)]
pub async fn unlock(
    ctx: Context<'_>,
    #[description = "The channel to unlock (defaults to current channel)"] channel: Option<
        GuildChannel,
    >,
) -> Result<(), Error> {
    let caller_id = ctx.author().id.get();
    info!(caller_id, "Invoked unlock command");

    let meta = GuildMetadata::extract(&ctx)?;
    let target_channel = lockdown::resolve_target_channel(&ctx, channel).await?;
    let target_channel_id = target_channel.id.get();
    let everyone_role_id = RoleId::new(meta.id.get());

    lockdown::restore_pre_lockdown_state(&ctx.serenity_context(), &ctx.data(), meta.id, target_channel.id, everyone_role_id).await?;

    ctx.say(format!("🔓 <#{}> has been unlocked.", target_channel.id))
        .await?;

    log_action(
        &ctx,
        meta.id,
        target_channel_id,
        ActionType::Unlock,
        None,
    )
        .await?;

    info!(caller_id, target_channel_id, "Channel unlocked successfully");
    Ok(())
}

/// Lock down all text channels across the entire server.
#[poise::command(slash_command, required_permissions = "MANAGE_CHANNELS", guild_only)]
pub async fn global_lock(
    ctx: Context<'_>,
    #[description = "Reason for the server-wide lockdown"] reason: Option<String>,
) -> Result<(), Error> {
    let caller_id = ctx.author().id.get();
    let guild_id = ctx.guild_id().map(|g| g.get());
    info!(caller_id, guild_id, "Invoked global_lock command");

    let meta = GuildMetadata::extract(&ctx)?;

    ctx.say("⏳ Initiating global lockdown. Processing channels...")
        .await?;

    let report = lockdown::apply_global_lock(&ctx.serenity_context(), &ctx.data(), meta.id).await?;

    if let Some(report) = report {
        let reason_str = reason.as_deref().unwrap_or("No reason provided");

        ctx.say(format!(
            "🛑 **Global lockdown complete.** Locked {} text channels. \n**Reason:** {}",
            report.succeeded, reason_str
        ))
            .await?;

        let detailed_reason = format!(
            "{} (Channels affected: {}, failed: {})",
            reason_str,
            report.succeeded,
            report.failed_channel_ids.len()
        );
        log_action(
            &ctx,
            meta.id,
            meta.id.get(),
            ActionType::GlobalLock,
            Some(&detailed_reason),
        )
            .await?;

        info!(
            caller_id,
            guild_id,
            locked_count = report.succeeded,
            failed_count = report.failed_channel_ids.len(),
            "Global lockdown completed successfully"
        );
    } else {
        ctx.say("Global lockdown is already in progress. Please wait a moment and try again.")
            .await?;
    }
    Ok(())
}

/// Unlock all text channels across the server.
#[poise::command(slash_command, required_permissions = "MANAGE_CHANNELS", guild_only)]
pub async fn global_unlock(ctx: Context<'_>) -> Result<(), Error> {
    let caller_id = ctx.author().id.get();
    let guild_id = ctx.guild_id().map(|g| g.get());
    info!(caller_id, guild_id, "Invoked global_unlock command");

    let meta = GuildMetadata::extract(&ctx)?;

    ctx.say("Initiating global unlock. Processing channels...")
        .await?;

    let report = lockdown::apply_global_unlock(&ctx.serenity_context(), &ctx.data(), meta.id).await?;

    if let Some(report) = report {
        ctx.say(format!(
            "🔓 **Global unlock complete.** Unlocked {} text channels.",
            report.succeeded
        ))
            .await?;

        let detailed_reason = format!(
            "Channels affected: {}, failed: {}",
            report.succeeded,
            report.failed_channel_ids.len()
        );
        log_action(
            &ctx,
            meta.id,
            meta.id.get(),
            ActionType::GlobalUnlock,
            Some(&detailed_reason),
        )
            .await?;

        info!(
        caller_id,
        guild_id,
        unlocked_count = report.succeeded,
        failed_count = report.failed_channel_ids.len(),
        "Global unlock completed successfully"
    );
    } else {
        ctx.say("Global unlock is already in progress. Please wait a moment and try again.")
            .await?;
    }
    Ok(())
}

/// Logs the action to the database and dispatches the log system's Discord embed.
pub async fn log_action(
    ctx: &Context<'_>,
    guild_id: GuildId,
    target_id: u64,
    action: ActionType,
    reason: Option<&str>,
) -> Result<(), Error> {
    trace!(
        guild_id = guild_id.get(),
        target_id,
        action = ?action,
        "Dispatching moderation log to database and Discord integration"
    );
    log_moderation_action(
        &ctx.data().db, guild_id, None, &ctx.author(), reason, action, None,
    ).await?;
    Ok(())
}