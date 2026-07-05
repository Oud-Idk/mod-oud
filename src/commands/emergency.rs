use crate::types::{Context, Error, GuildMetadata};
use crate::utils::logger::ActionType;
use crate::utils::moderation;
use poise::serenity_prelude as serenity;
use serenity::model::channel::GuildChannel;
use serenity::{PermissionOverwrite, PermissionOverwriteType, Permissions, RoleId};
use tracing::{info, trace, warn};

/// Resolves the guild channel from the parameter or falls back to the current context channel.
async fn resolve_target_channel(
    ctx: &Context<'_>,
    channel: Option<GuildChannel>,
) -> Result<GuildChannel, Error> {
    trace!("Resolving target channel for lockdown operation");
    match channel {
        Some(ch) => {
            trace!(channel_id = ch.id.get(), "Using provided target channel");
            Ok(ch)
        }
        None => {
            trace!("No channel provided; falling back to the current context channel");
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
    trace!(
        channel_id = channel.id.get(),
        "Calculating permission overwrite for lockdown"
    );
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
    let target_channel = resolve_target_channel(&ctx, channel).await?;
    let target_channel_id = target_channel.id.get();
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

    moderation::log_action(
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
    let target_channel = resolve_target_channel(&ctx, channel).await?;
    let target_channel_id = target_channel.id.get();
    let everyone_role_id = RoleId::new(meta.id.get());

    target_channel
        .id
        .delete_permission(ctx.http(), PermissionOverwriteType::Role(everyone_role_id))
        .await?;

    ctx.say(format!("🔓 <#{}> has been unlocked.", target_channel.id))
        .await?;

    moderation::log_action(
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
    let everyone_role_id = RoleId::new(meta.id.get());

    ctx.say("⏳ Initiating global lockdown. Processing channels...")
        .await?;

    let channels = meta.id.channels(ctx.http()).await?;
    let mut locked_count = 0;

    for (_, channel) in channels {
        if channel.is_text_based() {
            let channel_id = channel.id.get();
            let overwrite = calculate_lockdown_overwrite(&channel, everyone_role_id);
            match channel.id.create_permission(ctx.http(), overwrite).await {
                Ok(_) => {
                    locked_count += 1;
                    trace!(channel_id, "Lockdown applied to channel");
                }
                Err(err) => {
                    warn!(
                        error = ?err,
                        channel_id,
                        "Failed to apply lockdown permission overwrite to channel"
                    );
                }
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
    moderation::log_action(
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
        locked_count,
        "Global lockdown completed successfully"
    );
    Ok(())
}

/// Unlock all text channels across the server.
#[poise::command(slash_command, required_permissions = "MANAGE_CHANNELS", guild_only)]
pub async fn global_unlock(ctx: Context<'_>) -> Result<(), Error> {
    let caller_id = ctx.author().id.get();
    let guild_id = ctx.guild_id().map(|g| g.get());
    info!(caller_id, guild_id, "Invoked global_unlock command");

    let meta = GuildMetadata::extract(&ctx)?;
    let everyone_role_id = RoleId::new(meta.id.get());

    ctx.say("⏳ Initiating global unlock. Processing channels...")
        .await?;

    let channels = meta.id.channels(ctx.http()).await?;
    let mut unlocked_count = 0;

    for (_, channel) in channels {
        if channel.is_text_based() {
            let channel_id = channel.id.get();
            let target_overwrite = PermissionOverwriteType::Role(everyone_role_id);
            match channel.id.delete_permission(ctx.http(), target_overwrite).await {
                Ok(_) => {
                    unlocked_count += 1;
                    trace!(channel_id, "Lockdown removed from channel");
                }
                Err(err) => {
                    warn!(
                        error = ?err,
                        channel_id,
                        "Failed to remove lockdown permission overwrite from channel"
                    );
                }
            }
        }
    }

    ctx.say(format!(
        "🔓 **Global unlock complete.** Unlocked {} text channels.",
        unlocked_count
    ))
        .await?;

    let detailed_reason = format!("Channels affected: {}", unlocked_count);
    moderation::log_action(
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
        unlocked_count,
        "Global unlock completed successfully"
    );
    Ok(())
}