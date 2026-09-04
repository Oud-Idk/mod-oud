use crate::core::config::settings::get_settings;
use crate::core::config::state::{BotData, Error};
use crate::features::raid_detection::{cache, database};
use crate::features::verification::CaptchaType;
use serde::{Deserialize, Serialize};
use serenity::all::Context;
use serenity::all::{EditRole, GuildId, Permissions, RoleId};
use tracing::{debug, error, info, instrument};

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
    debug!(%guild_id, "Fetching current guild state and permissions for pre-raid snapshot");

    // Fetch current guild state from Discord HTTP/Cache
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
        error!(error = ?e, %guild_id, "Failed to persist active raid state to database");
    }

    if snapshot_saved {
        info!(
            %guild_id,
            everyone_permissions = everyone_perms,
            verification_type = ?snapshot.original_verification_type,
            use_oauth = ?snapshot.original_oauth_required,
            "Successfully created and saved pre-raid state snapshot"
        );
    } else {
        debug!(%guild_id, "Pre-raid snapshot already exists in Redis; skipping overwrite");
    }

    Ok(())
}

/// Restores original guild state saved in Redis prior to the raid and removes the snapshot.
#[instrument(skip(ctx, data), fields(guild_id = %guild_id))]
pub async fn restore_preraid_state(
    ctx: &Context,
    data: &BotData,
    guild_id: GuildId,
) -> Result<bool, Error> {
    info!(%guild_id, "Initiating pre-raid state restoration");

    let json_str = cache::getdel_preraid_snapshot(&data.core.redis, guild_id).await?;
    let Some(json_str) = json_str else {
        // Another worker or manual intervention already claimed and processed this snapshot!
        debug!(%guild_id, "Snapshot already claimed or non-existent; skipping duplicate restoration");
        return Ok(false);
    };

    let snapshot: PreRaidState = serde_json::from_str(&json_str)?;

    debug!(
        %guild_id,
        raid_start_time = %snapshot.raid_start_time,
        "Restoring @everyone role permissions"
    );

    let everyone_role_id = RoleId::new(guild_id.get());
    let original_perms = Permissions::from_bits_truncate(snapshot.original_everyone_permissions);
    let role_builder = EditRole::new().permissions(original_perms);

    if let Err(e) = guild_id
        .edit_role(&ctx.http, everyone_role_id, role_builder)
        .await
    {
        error!(
            error = ?e,
            %guild_id,
            "Failed to restore @everyone role permissions"
        );
    }

    // Restore verification settings in the database
    let captcha_str = snapshot.original_verification_type.map(|c| format!("{c}"));

    debug!(%guild_id, "Restoring verification settings in database");
    database::restore_verification_settings(
        &data.core.db,
        guild_id,
        snapshot.original_oauth_required,
        captcha_str.as_deref(),
    )
        .await?;

    // Remove from active raids set
    let _: () = cache::remove_guild_from_raid(guild_id, &data.core.redis).await?;

    // Delete persisted state from Postgres
    if let Err(e) = database::delete_active_raid_state(&data.core.db, guild_id).await {
        error!(error = ?e, %guild_id, "Failed to delete active raid state from database");
    }

    info!(%guild_id, "Successfully claimed and restored pre-raid state");

    Ok(true)
}
