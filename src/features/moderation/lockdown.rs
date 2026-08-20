use crate::core::config::state::{BotData, Context};
use crate::features::moderation::cache;
use crate::features::moderation::keys;
use crate::shared::locking::acquire_lock;
use anyhow::Context as _;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use serenity::all::{
    ChannelId, ChannelType, Context as SerenityContext, GuildChannel, GuildId, PermissionOverwrite,
    PermissionOverwriteType, Permissions, RoleId,
};
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::{debug, trace, warn};

const GLOBAL_SWEEP_LOCK_HEARTBEAT_SECS: u64 = 5;

fn global_sweep_lock_key(guild_id: GuildId) -> String {
    format!("lockdown:sweep-lock:{}", guild_id.get())
}

fn generate_sweep_token() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{}-{}", std::process::id(), nanos)
}

#[derive(Debug, Serialize, Deserialize)]
enum StoredOverwriteState {
    NoOverwrite,
    Existing { allow: u64, deny: u64 },
}

pub async fn save_pre_lockdown_state(
    guild_id: GuildId,
    channel: &GuildChannel,
    everyone_role_id: RoleId,
    data: &BotData,
) -> Result<()> {
    let key = keys::lockdown_redis_key(guild_id, channel.id);
    let target_kind = PermissionOverwriteType::Role(everyone_role_id);

    let state = channel
        .permission_overwrites
        .iter()
        .find(|o| o.kind == target_kind)
        .map_or(StoredOverwriteState::NoOverwrite, |existing| {
            StoredOverwriteState::Existing {
                allow: existing.allow.bits(),
                deny: existing.deny.bits(),
            }
        });

    let json = serde_json::to_string(&state)?;
    trace!(
        channel_id = channel.id.get(),
        "Attempting write-once cache of pre-lockdown overwrite state"
    );
    let wrote = cache::set_pre_lockdown_state(&data.core.redis, key, json).await?;

    if !wrote {
        trace!(
            channel_id = channel.id.get(),
            "Pre-lockdown state already cached; leaving existing snapshot untouched"
        );
    }

    Ok(())
}

/// Restores the channel's `@everyone` overwrite to whatever it was before lockdown,
/// using the Redis snapshot. Falls back to deleting the overwrite entirely if no
/// snapshot is present at all (e.g. the channel was never locked, or was already
/// restored and unlocked a second time).
pub async fn restore_pre_lockdown_state(
    ctx: &SerenityContext,
    data: &BotData,
    guild_id: GuildId,
    channel_id: ChannelId,
    everyone_role_id: RoleId,
) -> Result<()> {
    let key = keys::lockdown_redis_key(guild_id, channel_id);
    let cached: Option<String> =
        cache::get_pre_lockdown_state(&data.core.redis, key.clone()).await?;

    if let Some(json) = cached {
        let state: StoredOverwriteState = serde_json::from_str(&json)?;
        match state {
            StoredOverwriteState::Existing { allow, deny } => {
                let overwrite = PermissionOverwrite {
                    allow: Permissions::from_bits_truncate(allow),
                    deny: Permissions::from_bits_truncate(deny),
                    kind: PermissionOverwriteType::Role(everyone_role_id),
                };
                trace!(
                    channel_id = channel_id.get(),
                    "Restoring cached pre-lockdown overwrite"
                );
                channel_id.create_permission(&ctx.http, overwrite).await?;
            }
            StoredOverwriteState::NoOverwrite => {
                trace!(
                    channel_id = channel_id.get(),
                    "Cached state shows no prior overwrite; deleting overwrite entirely"
                );
                channel_id
                    .delete_permission(&ctx.http, PermissionOverwriteType::Role(everyone_role_id))
                    .await?;
            }
        }
        cache::delete_pre_lockdown_state(&data.core.redis, key).await?;
    } else {
        trace!(
            channel_id = channel_id.get(),
            "No cached state found; deleting overwrite entirely"
        );
        channel_id
            .delete_permission(&ctx.http, PermissionOverwriteType::Role(everyone_role_id))
            .await?;
    }

    Ok(())
}

/// Outcome of a server-wide lock or unlock sweep: how many text channels succeeded,
/// and the ids of any that failed (so a caller can decide whether/how to report them).
#[derive(Debug, Default, Clone)]
pub struct GlobalLockdownReport {
    pub succeeded: usize,
    pub failed_channel_ids: Vec<u64>,
}

/// Locks down every text channel in the guild, caching each channel's pre-lockdown
/// `@everyone` overwrite in Redis first.
///
/// Returns `Ok(None)` if a global lock or unlock sweep is already running for this
/// guild — the caller should treat that as "did nothing, one is already in flight"
/// rather than as an error.
///
/// # Errors
/// Returns an error if the Redis lock cannot be acquired, the per-channel
/// overwrites cannot be cached, or a Discord API channel edit fails.
pub async fn apply_global_lock(
    ctx: &SerenityContext,
    data: &BotData,
    guild_id: GuildId,
) -> Result<Option<GlobalLockdownReport>> {
    let lock_key = global_sweep_lock_key(guild_id);
    let lock_token = generate_sweep_token();

    let Some(guard) = acquire_lock(
        &data.core.redis,
        &lock_key,
        &lock_token,
        GLOBAL_SWEEP_LOCK_HEARTBEAT_SECS,
    )
    .await?
    else {
        debug!(
            %guild_id,
            "Global lock sweep already in progress for this guild; skipping"
        );
        return Ok(None);
    };

    let everyone_role_id = RoleId::new(guild_id.get());
    let channels = guild_id.channels(&ctx.http).await?;
    let mut report = GlobalLockdownReport::default();

    for (_, channel) in channels {
        let in_scope = channel.is_text_based()
            || matches!(channel.kind, ChannelType::Voice | ChannelType::Stage);
        if !in_scope {
            continue;
        }
        let channel_id = channel.id.get();

        if let Err(err) = save_pre_lockdown_state(guild_id, &channel, everyone_role_id, data).await
        {
            warn!(
                error = ?err,
                channel_id,
                "Failed to cache pre-lockdown state for channel; proceeding without it"
            );
        }

        let overwrite = calculate_lockdown_overwrite(&channel, everyone_role_id);
        match channel.id.create_permission(&ctx.http, overwrite).await {
            Ok(()) => {
                report.succeeded += 1;
                trace!(channel_id, "Lockdown applied to channel");
            }
            Err(err) => {
                warn!(
                    error = ?err,
                    channel_id,
                    "Failed to apply lockdown permission overwrite to channel"
                );
                report.failed_channel_ids.push(channel_id);
            }
        }
    }

    // Explicit release (rather than just letting the guard drop) so the lock frees up
    // immediately instead of waiting out its TTL if another sweep wants to run right after.
    if let Err(err) = guard.release().await {
        warn!(error = ?err, %guild_id, "Failed to explicitly release sweep lock; it will still expire via TTL");
    }

    Ok(Some(report))
}

/// Unlocks every text channel in the guild, restoring each one's cached pre-lockdown
/// `@everyone` overwrite (or deleting it entirely if none was cached).
///
/// Returns `Ok(None)` if a global lock or unlock sweep is already running for this
/// guild — the caller should treat that as "did nothing, one is already in flight"
/// rather than as an error.
///
/// # Errors
/// Returns an error if the Redis lock cannot be acquired or a Discord API
/// channel edit fails.
pub async fn apply_global_unlock(
    ctx: &SerenityContext,
    data: &BotData,
    guild_id: GuildId,
) -> Result<Option<GlobalLockdownReport>> {
    let lock_key = global_sweep_lock_key(guild_id);
    let lock_token = generate_sweep_token();

    let Some(guard) = acquire_lock(
        &data.core.redis,
        &lock_key,
        &lock_token,
        GLOBAL_SWEEP_LOCK_HEARTBEAT_SECS,
    )
    .await?
    else {
        debug!(
            %guild_id,
            "Global lock sweep already in progress for this guild; skipping"
        );
        return Ok(None);
    };

    let everyone_role_id = RoleId::new(guild_id.get());
    let channels = guild_id.channels(&ctx.http).await?;
    let mut report = GlobalLockdownReport::default();

    for (_, channel) in channels {
        let in_scope = channel.is_text_based()
            || matches!(channel.kind, ChannelType::Voice | ChannelType::Stage);
        if !in_scope {
            continue;
        }
        let channel_id = channel.id.get();

        match restore_pre_lockdown_state(ctx, data, guild_id, channel.id, everyone_role_id).await {
            Ok(()) => {
                report.succeeded += 1;
                trace!(channel_id, "Lockdown removed from channel");
            }
            Err(err) => {
                warn!(
                    error = ?err,
                    channel_id,
                    "Failed to remove lockdown permission overwrite from channel"
                );
                report.failed_channel_ids.push(channel_id);
            }
        }
    }

    if let Err(err) = guard.release().await {
        warn!(error = ?err, %guild_id, "Failed to explicitly release sweep lock; it will still expire via TTL");
    }

    Ok(Some(report))
}

/// Resolves the guild channel from the parameter or falls back to the current context channel.
pub async fn resolve_target_channel(
    ctx: &Context<'_>,
    channel: Option<GuildChannel>,
) -> Result<GuildChannel> {
    trace!("Resolving target channel for lockdown operation");
    if let Some(ch) = channel {
        trace!(channel_id = ch.id.get(), "Using provided target channel");
        Ok(ch)
    } else {
        trace!("No channel provided; falling back to the current context channel");
        let guild_channel = ctx
            .channel_id()
            .to_channel(ctx.http())
            .await?
            .guild()
            .with_context(|| "Failed to retrieve guild channel details")?;
        Ok(guild_channel)
    }
}

/// Generates a merged permission overwrite for lockouts without wiping existing overwrites.
/// Denies text-chat permissions on every channel, and additionally denies voice
/// permissions (CONNECT, SPEAK) when the channel is a voice or stage channel.
pub fn calculate_lockdown_overwrite(
    channel: &GuildChannel,
    everyone_role_id: RoleId,
) -> PermissionOverwrite {
    trace!(
        channel_id = channel.id.get(),
        "Calculating permission overwrite for lockdown"
    );

    let mut lockdown_deny = Permissions::SEND_MESSAGES
        | Permissions::SEND_MESSAGES_IN_THREADS
        | Permissions::ADD_REACTIONS;

    if matches!(channel.kind, ChannelType::Voice | ChannelType::Stage) {
        lockdown_deny |= Permissions::CONNECT | Permissions::SPEAK;
    }

    let target_kind = PermissionOverwriteType::Role(everyone_role_id);
    let existing = channel
        .permission_overwrites
        .iter()
        .find(|o| o.kind == target_kind);

    PermissionOverwrite {
        allow: existing.map_or_else(Permissions::empty, |o| o.allow),
        deny: existing.map_or_else(Permissions::empty, |o| o.deny) | lockdown_deny,
        kind: target_kind,
    }
}
