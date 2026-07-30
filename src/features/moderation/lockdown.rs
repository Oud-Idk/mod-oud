use crate::features::moderation::keys;
use crate::{Context, Data, Error};
use fred::interfaces::KeysInterface;
use fred::types::SetOptions;
use serde::{Deserialize, Serialize};
use serenity::all::{ChannelId, GuildChannel, GuildId, PermissionOverwrite, PermissionOverwriteType, Permissions, RoleId, Context as SerenityContext, ChannelType};
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::{debug, trace, warn};
use crate::shared::locking::acquire_lock;

/// How often the sweep lock's TTL is renewed while a global lock/unlock sweep is
/// running. The lock's initial (and post-renewal) TTL is 3x this, per `acquire_lock`'s
/// contract, so a sweep can safely take a few multiples of this long without losing
/// ownership mid-way through.
const GLOBAL_SWEEP_LOCK_HEARTBEAT_SECS: u64 = 5;

/// Redis key guarding server-wide lock/unlock sweeps for a guild. Shared between
/// `apply_global_lock` and `apply_global_unlock` so the two can never run concurrently
/// against each other, not just against themselves.
fn global_sweep_lock_key(guild_id: GuildId) -> String {
    format!("lockdown:sweep-lock:{}", guild_id.get())
}

/// A cheap, sufficiently-unique token identifying this particular sweep attempt, so
/// `acquire_lock`'s ownership check (GET == token) can tell "still us" apart from
/// "someone else grabbed it after we lost it."
fn generate_sweep_token() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{}-{}", std::process::id(), nanos)
}

/// Serializable snapshot of a channel's `@everyone` overwrite state, stored in Redis
/// before a lockdown mutates it so `unlock` can restore the exact prior state.
///
/// This is explicit about the "no overwrite existed" case (`NoOverwrite`) rather than
/// using key-absence to mean that, because key-absence is also what a *never-locked*
/// channel looks like — and those two cases need to be distinguishable under
/// write-once (`SET NX`) semantics (see `save_pre_lockdown_state`).
#[derive(Debug, Serialize, Deserialize)]
enum StoredOverwriteState {
    NoOverwrite,
    Existing { allow: u64, deny: u64 },
}

/// Snapshots the channel's current `@everyone` overwrite state into Redis before a
/// lockdown is applied, using `SET NX` so the write only ever takes effect once.
///
/// This makes locking idempotent with respect to the snapshot: if `lock`/`global_lock`
/// is run again on an already-locked channel, the second call sees the *already-locked*
/// overwrite and must NOT let it clobber the true original — NX guarantees that only the
/// very first snapshot (the real "before" state) survives, and it stays put until
/// `restore_pre_lockdown_state` consumes and deletes it.
pub async fn save_pre_lockdown_state(
    guild_id: GuildId,
    channel: &GuildChannel,
    everyone_role_id: RoleId,
    data: &Data,
) -> Result<(), Error> {
    let key = keys::lockdown_redis_key(guild_id, channel.id);
    let target_kind = PermissionOverwriteType::Role(everyone_role_id);

    let state = match channel
        .permission_overwrites
        .iter()
        .find(|o| o.kind == target_kind)
    {
        Some(existing) => StoredOverwriteState::Existing {
            allow: existing.allow.bits(),
            deny: existing.deny.bits(),
        },
        None => StoredOverwriteState::NoOverwrite,
    };

    let json = serde_json::to_string(&state)?;
    trace!(
        channel_id = channel.id.get(),
        "Attempting write-once cache of pre-lockdown overwrite state"
    );
    let wrote: Option<()> = data
        .redis
        .set(key, json, None, Some(SetOptions::NX), false)
        .await?;

    if wrote.is_none() {
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
    data: &Data,
    guild_id: GuildId,
    channel_id: ChannelId,
    everyone_role_id: RoleId,
) -> Result<(), Error> {
    let key = keys::lockdown_redis_key(guild_id, channel_id);
    let cached: Option<String> = data.redis.get(&key).await?;

    match cached {
        Some(json) => {
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
            let _: () = data.redis.del(key).await?;
        }
        None => {
            trace!(
                channel_id = channel_id.get(),
                "No cached state found; deleting overwrite entirely"
            );
            channel_id
                .delete_permission(&ctx.http, PermissionOverwriteType::Role(everyone_role_id))
                .await?;
        }
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
/// `@everyone` overwrite in Redis first so it can be restored later. Safe to call
/// from any code path that has a `Context` and a `GuildId` — not just the slash command.
///
/// Returns `Ok(None)` if a global lock or unlock sweep is already running for this
/// guild — the caller should treat that as "did nothing, one is already in flight"
/// rather than as an error.
pub async fn apply_global_lock(
    ctx: &SerenityContext,
    data: &Data,
    guild_id: GuildId,
) -> Result<Option<GlobalLockdownReport>, Error> {
    let lock_key = global_sweep_lock_key(guild_id);
    let lock_token = generate_sweep_token();

    let guard = match acquire_lock(
        &data.redis,
        &lock_key,
        &lock_token,
        GLOBAL_SWEEP_LOCK_HEARTBEAT_SECS,
    )
        .await?
    {
        Some(guard) => guard,
        None => {
            debug!(
                guild_id = guild_id.get(),
                "Global lock sweep already in progress for this guild; skipping"
            );
            return Ok(None);
        }
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
            Ok(_) => {
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
        warn!(error = ?err, guild_id = guild_id.get(), "Failed to explicitly release sweep lock; it will still expire via TTL");
    }

    Ok(Some(report))
}

/// Unlocks every text channel in the guild, restoring each one's cached pre-lockdown
/// `@everyone` overwrite (or deleting it entirely if none was cached). Safe to call
/// from any code path that has a `Context` and a `GuildId` — not just the slash command.
///
/// Returns `Ok(None)` if a global lock or unlock sweep is already running for this
/// guild — the caller should treat that as "did nothing, one is already in flight"
/// rather than as an error.
pub async fn apply_global_unlock(
    ctx: &SerenityContext,
    data: &Data,
    guild_id: GuildId,
) -> Result<Option<GlobalLockdownReport>, Error> {
    let lock_key = global_sweep_lock_key(guild_id);
    let lock_token = generate_sweep_token();

    let guard = match acquire_lock(
        &data.redis,
        &lock_key,
        &lock_token,
        GLOBAL_SWEEP_LOCK_HEARTBEAT_SECS,
    )
        .await?
    {
        Some(guard) => guard,
        None => {
            debug!(
                guild_id = guild_id.get(),
                "Global lock sweep already in progress for this guild; skipping"
            );
            return Ok(None);
        }
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
            Ok(_) => {
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
        warn!(error = ?err, guild_id = guild_id.get(), "Failed to explicitly release sweep lock; it will still expire via TTL");
    }

    Ok(Some(report))
}

/// Resolves the guild channel from the parameter or falls back to the current context channel.
pub async fn resolve_target_channel(
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
        allow: existing.map(|o| o.allow).unwrap_or_else(Permissions::empty),
        deny: existing.map(|o| o.deny).unwrap_or_else(Permissions::empty) | lockdown_deny,
        kind: target_kind,
    }
}