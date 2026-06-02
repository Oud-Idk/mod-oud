use crate::commands::helpers::dm::GuildMetadata;
use crate::types::{Context, Error};
use crate::utils::logger::ActionType;
use crate::utils::logger::log_moderation_action;
use poise::serenity_prelude as serenity;
use serenity::model::channel::GuildChannel;
use serenity::{PermissionOverwrite, PermissionOverwriteType, Permissions, RoleId};

/// Resolves the guild channel from the parameter or falls back to the current context channel.
async fn resolve_target_channel(
    ctx: &Context<'_>,
    channel: Option<GuildChannel>,
) -> Result<GuildChannel, Error> {
    match channel {
        Some(ch) => Ok(ch),
        None => {
            let guild_channel = ctx
                .channel_id()
                .to_channel(ctx.http())
                .await?
                .guild()
                .ok_or("Failed to retrieve guild channel details")?;
            Ok(guild_channel)
        }
    }
}

/// Generates a merged permission overwrite for lockouts without wiping existing overwrites.
fn calculate_lockdown_overwrite(
    channel: &GuildChannel,
    everyone_role_id: RoleId,
) -> PermissionOverwrite {
    let lockdown_deny = Permissions::SEND_MESSAGES
        | Permissions::SEND_MESSAGES_IN_THREADS
        | Permissions::ADD_REACTIONS;

    let target_kind = PermissionOverwriteType::Role(everyone_role_id);
    let existing = channel
        .permission_overwrites
        .iter()
        .find(|o| o.kind == target_kind);

    PermissionOverwrite {
        allow: existing.map(|o| o.allow).unwrap_or_else(Permissions::empty),
        deny: existing.map(|o| o.deny).unwrap_or_else(Permissions::empty) | lockdown_deny,
        kind: target_kind,
    }
}

/// Logs the action to the database and dispatches the log system's Discord embed.
async fn log_action(
    ctx: &Context<'_>,
    guild_id: serenity::GuildId,
    target_id: u64,
    action: ActionType,
    reason: Option<&str>,
) -> Result<(), Error> {
    log_moderation_action(
        ctx,
        guild_id.get(),
        target_id,
        ctx.author().id.get(),
        action,
        reason,
        None,
    )
    .await?;
    Ok(())
}

/// Lock down a text channel, preventing members from sending messages.
#[poise::command(slash_command, required_permissions = "MANAGE_CHANNELS", guild_only)]
pub async fn lock(
    ctx: Context<'_>,
    #[description = "The channel to lock down (defaults to current channel)"] channel: Option<
        GuildChannel,
    >,
    #[description = "Reason for the lockdown"] reason: Option<String>,
) -> Result<(), Error> {
    let meta = GuildMetadata::extract(&ctx)?;
    let target_channel = resolve_target_channel(&ctx, channel).await?;
    let everyone_role_id = RoleId::new(meta.id.get());

    let overwrite = calculate_lockdown_overwrite(&target_channel, everyone_role_id);
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
        target_channel.id.get(),
        ActionType::Lock,
        Some(reason_str),
    )
    .await?;

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
    let meta = GuildMetadata::extract(&ctx)?;
    let target_channel = resolve_target_channel(&ctx, channel).await?;
    let everyone_role_id = RoleId::new(meta.id.get());

    target_channel
        .id
        .delete_permission(ctx.http(), PermissionOverwriteType::Role(everyone_role_id))
        .await?;

    ctx.say(format!("🔓 <#{}> has been unlocked.", target_channel.id))
        .await?;

    log_action(
        &ctx,
        meta.id,
        target_channel.id.get(),
        ActionType::Unlock,
        None,
    )
    .await?;

    Ok(())
}

/// Lock down all text channels across the entire server.
#[poise::command(slash_command, required_permissions = "MANAGE_CHANNELS", guild_only)]
pub async fn global_lock(
    ctx: Context<'_>,
    #[description = "Reason for the server-wide lockdown"] reason: Option<String>,
) -> Result<(), Error> {
    let meta = GuildMetadata::extract(&ctx)?;
    let everyone_role_id = RoleId::new(meta.id.get());

    ctx.say("⏳ Initiating global lockdown. Processing channels...")
        .await?;

    let channels = meta.id.channels(ctx.http()).await?;
    let mut locked_count = 0;

    for (_, channel) in channels {
        if channel.is_text_based() {
            let overwrite = calculate_lockdown_overwrite(&channel, everyone_role_id);
            if channel
                .id
                .create_permission(ctx.http(), overwrite)
                .await
                .is_ok()
            {
                locked_count += 1;
            }
        }
    }

    let reason_str = reason.as_deref().unwrap_or("No reason provided");

    ctx.say(format!(
        "🛑 **Global lockdown complete.** Locked {} text channels. \n**Reason:** {}",
        locked_count, reason_str
    ))
    .await?;

    let detailed_reason = format!("{} (Channels affected: {})", reason_str, locked_count);
    log_action(
        &ctx,
        meta.id,
        meta.id.get(),
        ActionType::GlobalLock,
        Some(&detailed_reason),
    )
    .await?;

    Ok(())
}

/// Unlock all text channels across the server.
#[poise::command(slash_command, required_permissions = "MANAGE_CHANNELS", guild_only)]
pub async fn global_unlock(ctx: Context<'_>) -> Result<(), Error> {
    let meta = GuildMetadata::extract(&ctx)?;
    let everyone_role_id = RoleId::new(meta.id.get());

    ctx.say("⏳ Initiating global unlock. Processing channels...")
        .await?;

    let channels = meta.id.channels(ctx.http()).await?;
    let mut unlocked_count = 0;

    for (_, channel) in channels {
        if channel.is_text_based() {
            let target_overwrite = PermissionOverwriteType::Role(everyone_role_id);
            if channel
                .id
                .delete_permission(ctx.http(), target_overwrite)
                .await
                .is_ok()
            {
                unlocked_count += 1;
            }
        }
    }

    ctx.say(format!(
        "🔓 **Global unlock complete.** Unlocked {} text channels.",
        unlocked_count
    ))
    .await?;

    let detailed_reason = format!("Channels affected: {}", unlocked_count);
    log_action(
        &ctx,
        meta.id,
        meta.id.get(),
        ActionType::GlobalUnlock,
        Some(&detailed_reason),
    )
    .await?;

    Ok(())
}
