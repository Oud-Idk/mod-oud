use crate::constants::BRAND_COLOR;
use crate::core::config::guild_ctx::get_guild_ctx;
use crate::core::config::settings::GuildSettings;
use crate::core::config::settings::get_settings;
use crate::core::config::state::Error;
use crate::features::moderation::{
    ActionType, log_moderation_action, replace_basic_placeholder, replace_reason_placeholders,
};
use crate::features::warning::database::{
    delete_warn, fetch_warn_thresholds, insert_warn, log_warning, update_warn,
};
use crate::features::warning::thresholds;
use crate::features::warning::types::{MODERATION_FOOTER, WarnThreshold};
use crate::shared::embed::build_custom_message;
use crate::shared::store_username_relation;
use crate::shared::username_cache::UserUpdate;
use crate::{fetch_mod_ctx, send_mod_dm};
use fred::clients::Client;
use serenity::all::{CreateEmbed, CreateEmbedFooter, CreateMessage, GuildId, Http, User, UserId};
use sqlx::PgPool;
use std::sync::Arc;
use tracing::{debug, info, instrument};

/// Issues a warning to a user, sending a DM and logging the action.
#[instrument(skip(db, redis_conn, guild_configs, http), fields(%guild_id, user_id = %user_id, moderator_id = %moderator_id
))]
pub async fn issue_warning(
    db: &PgPool,
    redis_conn: &Client,
    guild_configs: &moka::future::Cache<GuildId, GuildSettings>,
    username_buf: &tokio::sync::mpsc::Sender<UserUpdate>,
    http: &Arc<Http>,
    guild_id: GuildId,
    user_id: UserId,
    moderator_id: UserId,
    reason: &str,
    moderator_username: &str,
    target_username: &str,
) -> Result<i64, Error> {
    debug!("Inserting warning record into database");
    store_username_relation(username_buf, user_id.get(), target_username).await?;
    store_username_relation(username_buf, moderator_id.get(), moderator_username).await?;

    let (warn_id, warn_count) = insert_warn(db, guild_id, user_id, moderator_id, reason).await?;

    debug!(
        warn_id,
        warn_count, "Warning record inserted; logging action in moderation_logs"
    );
    debug!(warn_id, "Retrieving moderation context");
    let (gctx, mut member, settings) =
        fetch_mod_ctx!(db, redis_conn, guild_configs, http, guild_id, user_id);
    let moderator_user = http
        .get_user(moderator_id)
        .await
        .unwrap_or_else(|_| member.user.clone());

    let warn_dm_settings_opt = settings.moderation_dms.and_then(|m| m.warn);

    send_mod_dm!(
        http,
        user_id,
        warn_dm_settings_opt,
        "warn",
        |text| replace_reason_placeholders(text, &gctx, &member, reason, &moderator_user),
        {
            let mut embed = CreateEmbed::new()
                .title(format!("You have been formally warned from {}", gctx.name))
                .color(BRAND_COLOR)
                .field("Reason", reason, false)
                .field("ID", warn_id.to_string(), false)
                .footer(CreateEmbedFooter::new(MODERATION_FOOTER));

            if let Some(url) = &gctx.icon_url {
                embed = embed.thumbnail(url)
            }

            embed
        }
    );

    log_warning(db, guild_id, &member.user, &moderator_user, reason).await?;

    let thresholds = fetch_warn_thresholds(db, redis_conn, &guild_id).await?;
    let applicable_thresholds = thresholds
        .iter()
        .filter(|t| t.warn_count == warn_count)
        .collect::<Vec<&WarnThreshold>>();

    thresholds::apply_threshold_actions(http, db, &mut member, &applicable_thresholds).await?;

    info!(warn_id, "Successfully issued warning to user");
    Ok(warn_id)
}

/// Updates the active status of a warning, handles the custom/default DMs.
/// Returns `Some((target_user_id, reason))` if successful, or `None` if the warning wasn't found.
#[instrument(skip(db, redis_conn, guild_configs, http), fields(%guild_id_raw, warning_id = id, set_active, moderator_id = %author.id
))]
pub async fn issue_warning_status_change(
    db: &PgPool,
    redis_conn: &Client,
    guild_configs: &moka::future::Cache<GuildId, GuildSettings>,
    http: &Arc<Http>,
    guild_id_raw: GuildId,
    id: i64,
    set_active: bool,
    author: &User,
) -> Result<Option<(u64, String)>, Error> {
    let guild_id = guild_id_raw.get();
    let expected_current_state = !set_active;

    debug!("Updating warning status in database");
    let Some(row) = update_warn(db, set_active, id, guild_id, expected_current_state).await? else {
        debug!("Warning record not found; skipping update");
        return Ok(None);
    };

    let target_user_id = row.user_id.cast_unsigned();
    let user_id = UserId::new(target_user_id);
    let reason = row
        .reason
        .unwrap_or_else(|| "No reason specified.".to_string());

    debug!(target_user_id, "Warning updated; retrieving context for DM");

    let (gctx, member, settings) =
        fetch_mod_ctx!(db, redis_conn, guild_configs, http, guild_id_raw, user_id);
    let user = &member.user;

    let (action_past_tense, action_type) = if set_active {
        ("unpardoned", ActionType::Unpardon)
    } else {
        ("pardoned", ActionType::Pardon)
    };

    log_moderation_action(
        db,
        guild_id_raw,
        Some(user),
        author,
        None,
        action_type,
        None,
    )
    .await?;

    let dm_settings_opt = if set_active {
        settings.moderation_dms.and_then(|m| m.unpardon_warn)
    } else {
        settings.moderation_dms.and_then(|m| m.pardon_warn)
    };

    send_mod_dm!(
        http,
        user,
        dm_settings_opt,
        action_past_tense,
        |text| { replace_basic_placeholder(text, &gctx, &member, author,) },
        {
            let mut embed = CreateEmbed::new()
                .title(format!(
                    "Your warning at {} has been {}.",
                    gctx.name, action_past_tense
                ))
                .field("Warning Reason", &reason, false)
                .field("Warning ID", id.to_string(), false)
                .color(BRAND_COLOR);

            if let Some(url) = &gctx.icon_url {
                embed = embed.thumbnail(url);
            }

            embed
        }
    );

    info!(
        target_user_id,
        action = action_past_tense,
        "Successfully processed warning status update"
    );
    Ok(Some((target_user_id, reason)))
}

/// Deletes a warning from the database, builds and sends the appropriate DM (custom or default).
/// Returns `Some((target_user_id, reason))` if deleted, or `None` if the warning didn't exist.
#[instrument(skip(db, redis_conn, guild_configs, http), fields(%guild_id_raw, warning_id = id, moderator_id = %author.id
))]
pub async fn issue_delete_warning(
    db: &PgPool,
    redis_conn: &Client,
    guild_configs: &moka::future::Cache<GuildId, GuildSettings>,
    http: &Arc<Http>,
    guild_id_raw: GuildId,
    id: i64,
    author: &User,
) -> Result<Option<(u64, String)>, Error> {
    let guild_id = guild_id_raw.get();

    debug!("Deleting warning record from database");
    let Some(row) = delete_warn(db, id, guild_id).await? else {
        debug!("Warning record not found; skipping deletion");
        return Ok(None);
    };

    let target_user_id = row.user_id as u64;
    let user_id = UserId::new(target_user_id);
    let reason = row
        .reason
        .unwrap_or_else(|| "No reason specified.".to_string());

    debug!(
        target_user_id,
        "Record deleted; retrieving context for warning deletion message"
    );

    let (gctx, member, settings) =
        fetch_mod_ctx!(db, redis_conn, guild_configs, http, guild_id_raw, user_id);
    let user = &member.user;

    let dm_settings_opt = settings.moderation_dms.and_then(|m| m.unpardon_delete_warn);

    send_mod_dm!(
        http,
        user,
        dm_settings_opt,
        "delete_warning",
        |text| { replace_basic_placeholder(text, &gctx, &member, author,) },
        {
            let mut embed = CreateEmbed::new()
                .title(format!(
                    "Your warning at {} has been permanently deleted.",
                    gctx.name
                ))
                .field("Warning Reason", &reason, false)
                .field("Warning ID", id.to_string(), false)
                .color(BRAND_COLOR);

            if let Some(url) = &gctx.icon_url {
                embed = embed.thumbnail(url);
            }

            embed
        }
    );

    info!(target_user_id, "Successfully processed warning deletion");
    Ok(Some((target_user_id, reason)))
}
