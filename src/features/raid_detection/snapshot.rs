use crate::core::config::settings::get_settings;
use crate::core::config::state::{BotData, Error};
use crate::features::raid_detection::{cache, database};
use crate::features::verification::CaptchaType;
use serde::{Deserialize, Serialize};
use serenity::all::Context;
use serenity::all::{EditRole, GuildId, Permissions, RoleId};
use tracing::{debug, error, info, instrument, warn};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreRaidState {
    pub raid_start_time: chrono::DateTime<chrono::Utc>,
    pub original_verification_type: Option<CaptchaType>,
    pub original_oauth_required: Option<bool>,
    pub original_everyone_permissions: u64,
}

/// Saves original guild state into Redis if a snapshot doesn't already exist for this raid session.
#[instrument(skip(ctx, data), fields(guild_id = %guild_id))]
pub async fn ensure_preraid_state_saved(
    ctx: &Context,
    data: &BotData,
    guild_id: GuildId,
) -> Result<(), Error> {
    let partial_guild = guild_id.to_partial_guild(&ctx.http).await?;

    let everyone_role_id = RoleId::new(guild_id.get());
    let everyone_perms = partial_guild
        .roles
        .get(&everyone_role_id)
        .map_or(0, |r| r.permissions.bits());

    let mut snapshot = PreRaidState {
        raid_start_time: chrono::Utc::now(),
        original_verification_type: None,
        original_oauth_required: None,
        original_everyone_permissions: everyone_perms,
    };

    let settings = get_settings(
        &data.core.db,
        &data.core.redis,
        &data.core.guild_configs_cache,
        guild_id,
    )
    .await?;
    if let Some(verification_settings) = settings.verification_settings() {
        snapshot.original_verification_type = verification_settings.captcha_type.clone();
        snapshot.original_oauth_required = verification_settings.use_oauth;
    }

    let serialized = serde_json::to_string(&snapshot)?;

    // Store in Redis with NX (Only set if not already present) and an expiration (24 hours)
    let conn = &data.core.redis;
    let snapshot_saved = cache::save_preraid_snapshot(conn, guild_id, &serialized).await?;

    let _: () = cache::add_guild_to_raid(guild_id, conn).await?;

    if let Err(e) = database::save_active_raid_state(&data.core.db, guild_id, &snapshot).await {
        error!(error = ?e, %guild_id, "active raid state write to database failed");
    }

    if snapshot_saved {
        info!(
            %guild_id,
            everyone_permissions = everyone_perms,
            verification_type = ?snapshot.original_verification_type,
            use_oauth = ?snapshot.original_oauth_required,
            "created and saved pre-raid state snapshot"
        );
    } else {
        debug!(%guild_id, "pre-raid snapshot already exists in Redis; skipping overwrite");
    }

    Ok(())
}

/// Restores original guild state saved in Redis prior to the raid.
///
/// The snapshot is read without being consumed, and only deleted once the `@everyone` permissions
/// have actually been restored. Deleting it first meant a failed restore left the guild locked with
/// nothing left to retry from, and the only way out was manual permission repair.
#[instrument(skip(ctx, data), fields(guild_id = %guild_id))]
pub async fn restore_preraid_state(
    ctx: &Context,
    data: &BotData,
    guild_id: GuildId,
) -> Result<bool, Error> {
    let Some(json_str) = cache::peek_preraid_snapshot(&data.core.redis, guild_id).await? else {
        debug!(%guild_id, "no pre-raid snapshot; nothing to restore");
        return Ok(false);
    };

    let snapshot: PreRaidState = match serde_json::from_str(&json_str) {
        Ok(snapshot) => snapshot,
        Err(e) => {
            // This snapshot will never parse, so it must not block every later raid end for the
            // guild. Drop it and let the caller reconcile in its own way.
            error!(error = ?e, %guild_id, "pre-raid snapshot unreadable; discarding it");
            if let Err(e) = cache::delete_preraid_snapshot(&data.core.redis, guild_id).await {
                warn!(error = ?e, %guild_id, "unreadable pre-raid snapshot not discarded");
            }
            return Ok(false);
        }
    };

    let everyone_role_id = RoleId::new(guild_id.get());
    let original_perms = Permissions::from_bits_truncate(snapshot.original_everyone_permissions);
    let role_builder = EditRole::new().permissions(original_perms);

    // This is the step that decides whether the guild is still locked. If it fails, keep the
    // snapshot so the next tick can try again instead of discarding the only copy.
    guild_id
        .edit_role(&ctx.http, everyone_role_id, role_builder)
        .await
        .inspect_err(|e| {
            error!(
                error = ?e,
                %guild_id,
                "everyone permissions not restored; keeping the snapshot for a retry"
            );
        })?;

    // The guild is unlocked from here, so the remaining steps must not fail the whole restore.
    let captcha_str = snapshot.original_verification_type.map(|c| format!("{c}"));

    if let Err(e) = database::restore_verification_settings(
        &data.core.db,
        guild_id,
        snapshot.original_oauth_required,
        captcha_str.as_deref(),
    )
    .await
    {
        error!(error = ?e, %guild_id, "verification settings not restored");
    }

    if let Err(e) = cache::remove_guild_from_raid(guild_id, &data.core.redis).await {
        warn!(error = ?e, %guild_id, "guild not removed from the raid tracking set");
    }

    if let Err(e) = database::delete_active_raid_state(&data.core.db, guild_id).await {
        error!(error = ?e, %guild_id, "active raid state row not deleted from database");
    }

    if let Err(e) = cache::delete_preraid_snapshot(&data.core.redis, guild_id).await {
        // Harmless: the next restore re-applies the same permissions and then tries again.
        warn!(error = ?e, %guild_id, "pre-raid snapshot not deleted after a successful restore");
    }

    info!(%guild_id, "restored pre-raid state");

    Ok(true)
}
