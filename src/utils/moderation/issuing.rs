use crate::commands::moderation::warn::database::{delete_warn, update_warn};
use crate::core::config::get_guild_ctx;
use crate::core::config::get_settings;
use crate::types::config::config::GuildSettings;
use crate::types::Error;
use crate::utils::custom_msg::build_custom_message;
use crate::utils::logger::{log_moderation_action, ActionType};
use crate::utils::moderation::database::{fetch_warn_thresholds, insert_warn, log_warning, WarnThreshold};
use crate::utils::moderation::{actions, MODERATION_FOOTER};
use crate::utils::placeholders::{replace_ban_placeholders, replace_basic_placeholder, replace_kick_placeholder, replace_mute_placeholder, replace_reason_placeholders};
use crate::{fetch_mod_ctx, send_mod_dm};
use chrono::TimeDelta;
use duration_str::HumanFormat;
use fred::clients::Client;
use serenity::all::{ChannelId, CreateEmbed, CreateEmbedFooter, CreateInvite, CreateMessage, GuildId, Http, Timestamp, User, UserId};
use sqlx::PgPool;
use std::sync::Arc;
use std::time::Duration;
use tracing::{debug, error, info, instrument, warn};

#[instrument(skip(db, redis_conn, guild_configs, http), fields(guild_id = %guild_id, user_id = %user_id, moderator_id = %moderator_id
))]
pub async fn issue_warning(
    db: &PgPool,
    redis_conn: &Client,
    guild_configs: &moka::future::Cache<i64, GuildSettings>,
    http: &Arc<Http>,
    guild_id: GuildId,
    user_id: UserId,
    moderator_id: UserId,
    reason: &str,
    moderator_username: &str,
    target_username: &str,
) -> Result<i64, Error> {
    debug!("Inserting warning record into database");

    let (warn_id, warn_count) = insert_warn(db, guild_id, user_id, moderator_id, reason, moderator_username, target_username).await?;

    debug!(warn_id, warn_count, "Warning record inserted; logging action in moderation_logs");
    debug!(warn_id, "Retrieving moderation context");
    let (gctx, mut member, settings) = fetch_mod_ctx!(db, redis_conn, guild_configs, http, guild_id, user_id);
    let moderator_user = http.get_user(moderator_id).await.unwrap_or_else(|_| member.user.clone());

    let warn_dm_settings_opt = settings.moderation_dms.and_then(|m| m.warn);

    send_mod_dm!(
        http,
        user_id,
        warn_dm_settings_opt,
        "warn",
        |text| replace_reason_placeholders(text, &gctx, &member, reason, &moderator_user),
        CreateEmbed::new()
            .title(format!("You have been formally warned from {}", gctx.name))
            .color(0xFF4747)
            .field("Reason", reason, false)
            .field("ID", warn_id.to_string(), false)
            .thumbnail(&gctx.icon_url)
            .footer(CreateEmbedFooter::new(MODERATION_FOOTER))
    );

    log_warning(db, guild_id, user_id, moderator_id, reason, moderator_username, target_username).await?;

    let thresholds = fetch_warn_thresholds(&db, &redis_conn, &guild_id).await?;
    let applicable_thresholds = thresholds
        .iter()
        .filter(|t| t.warn_count == warn_count)
        .collect::<Vec<&WarnThreshold>>();

    actions::apply_threshold_actions(&http, &db, &mut member, &applicable_thresholds).await?;

    info!(warn_id, "Successfully issued warning to user");
    Ok(warn_id)
}

#[instrument(skip(db, redis_conn, guild_configs, http), fields(guild_id = %guild_id, user_id = %user.id, moderator_id = %moderator.id
))]
pub async fn issue_kick(
    db: &PgPool,
    redis_conn: &Client,
    guild_configs: &moka::future::Cache<i64, GuildSettings>,
    http: &Arc<Http>,
    guild_id: GuildId,
    channel_id: ChannelId,
    user: User,
    moderator: User,
    reason: &str,
) -> Result<(), Error> {
    debug!("Retrieving moderation context for kick");
    let (gctx, member, settings) = fetch_mod_ctx!(db, redis_conn, guild_configs, http, guild_id, user.id);

    let kick_dm_settings_opt = settings.moderation_dms.and_then(|m| m.kick);
    let mut invite_url = None;

    if let Some(kick_dm_settings) = &kick_dm_settings_opt {
        let contains_invite = kick_dm_settings.content.contains("invite.url")
            || kick_dm_settings.embed.as_ref().map_or(false, |emb| {
            emb.description.as_ref().map_or(false, |d| d.contains("invite.url"))
                || emb.title.as_ref().map_or(false, |t| t.contains("invite.url"))
        });

        if contains_invite {
            debug!("Generating transient invite URL for kick DM fallback");
            let builder = CreateInvite::default()
                .max_age(86400) // 24 hrs
                .max_uses(1)
                .unique(true);

            match channel_id.create_invite(http, builder).await {
                Ok(invite) => {
                    invite_url = Some(format!("https://discord.gg/{}", invite.code));
                }
                Err(e) => {
                    warn!(error = ?e, "Failed to create Discord invite for kick DM");
                }
            }
        }
    }

    send_mod_dm!(
        http,
        user.id,
        kick_dm_settings_opt,
        "kick",
        |text| replace_kick_placeholder(
            text,
            &gctx,
            &member,
            reason,
            &moderator,
            invite_url.as_deref(),
        ),
        CreateEmbed::new()
            .title(format!("You have been kicked from {}", gctx.name))
            .color(0xff8a42)
            .field("Reason", reason, false)
            .thumbnail(&gctx.icon_url)
            .footer(CreateEmbedFooter::new(MODERATION_FOOTER))
    );

    log_moderation_action(
        db, guild_id, Some(&user), &moderator, Some(reason), "kick", None
    ).await?;

    debug!("Executing kick via Discord HTTP API");
    guild_id.kick_with_reason(http, user.id, reason).await?;

    info!("Successfully kicked user from guild");
    Ok(())
}

#[instrument(skip(db, redis_conn, guild_configs, http), fields(guild_id = %guild_id, user_id = %user.id, moderator_id = %moderator.id, duration_label
))]
pub async fn issue_ban(
    db: &PgPool,
    redis_conn: &Client,
    guild_configs: &moka::future::Cache<i64, GuildSettings>,
    http: &Arc<Http>,
    guild_id: GuildId,
    user: User,
    moderator: User,
    reason: &str,
    dmd_time: u8,
    duration: Option<Duration>,
    duration_label: &str,
) -> Result<(), Error> {
    debug!("Retrieving moderation context for ban");
    let (gctx, member, settings) = fetch_mod_ctx!(db, redis_conn, guild_configs, http, guild_id, user.id);

    let ban_dm_settings_opt = settings.moderation_dms.and_then(|m| m.ban);

    send_mod_dm!(
        http,
        user.id,
        ban_dm_settings_opt,
        "ban",
        |text| replace_ban_placeholders(text, &gctx, &member, reason, &moderator),
        CreateEmbed::new()
            .title(format!("You have been banned from {}", gctx.name))
            .color(0xFF4747)
            .field("Reason", reason, false)
            .field("Duration", duration_label, false)
            .thumbnail(&gctx.icon_url)
            .footer(CreateEmbedFooter::new(MODERATION_FOOTER))
    );

    debug!("Executing ban via Discord HTTP API");
    guild_id.ban_with_reason(http, user.id, dmd_time, reason).await?;

    if let Some(dur) = duration {
        debug!("Ban is scheduled; registering unban timeout in database");
        let chrono_dur = chrono::Duration::from_std(dur)?;
        let unban_at = chrono::Utc::now() + chrono_dur;

        sqlx::query!(
            "INSERT INTO temp_bans (guild_id, user_id, unban_at) VALUES ($1, $2, $3)",
            guild_id.get() as i64,
            user.id.get() as i64,
            unban_at
        )
            .execute(db)
            .await?;

        log_moderation_action(
            db, guild_id, Some(&user), &moderator, Some(reason), "ban", Some(chrono_dur)
        ).await?;
    }


    info!("Successfully banned user from guild");
    Ok(())
}

#[instrument(skip(db, redis_conn, guild_configs, http, user), fields(guild_id = %guild_id, user_id = %user.id, moderator_id = %moderator.id
))]
pub async fn issue_mute(
    db: &PgPool,
    redis_conn: &Client,
    guild_configs: &moka::future::Cache<i64, GuildSettings>,
    http: &Arc<Http>,
    guild_id: GuildId,
    user: User,
    moderator: User,
    reason: &str,
    duration: &Duration,
    timestamp: Timestamp,
) -> Result<(), Error> {
    debug!("Retrieving moderation context for timeout");
    let (gctx, mut member, settings) = fetch_mod_ctx!(db, redis_conn, guild_configs, http, guild_id, user.id);

    let mute_dm_settings_opt = settings.moderation_dms.and_then(|m| m.mute);

    send_mod_dm!(
        http,
        user.id,
        mute_dm_settings_opt,
        "mute",
        |text| replace_mute_placeholder(text, &gctx, &member, reason, &moderator, duration),
        CreateEmbed::new()
            .title(format!("You have been muted from {}", gctx.name))
            .color(0xFFC54F)
            .field("Reason", reason, false)
            .field("Duration", duration.human_format(), false)
            .thumbnail(&gctx.icon_url)
            .footer(CreateEmbedFooter::new(MODERATION_FOOTER))
    );

    debug!(until = %timestamp, "Applying timeout via Discord HTTP API");
    member.disable_communication_until_datetime(http, timestamp).await?;

    let timedelta = TimeDelta::from_std(*duration)?;

    log_moderation_action(
        db, guild_id, Some(&user), &moderator, Some(reason), "mute", Some(timedelta),
    ).await?;

    info!("Successfully muted user in guild");
    Ok(())
}

#[instrument(skip(db, redis_conn, guild_configs, http, user), fields(guild_id = %guild_id, user_id = %user.id, moderator_id = %moderator.id
))]
pub async fn issue_unmute(
    db: &PgPool,
    redis_conn: &Client,
    guild_configs: &moka::future::Cache<i64, GuildSettings>,
    http: &Arc<Http>,
    guild_id: GuildId,
    user: User,
    moderator: User,
) -> Result<(), Error> {
    debug!("Retrieving moderation context for unmute");
    let (gctx, mut member, settings) = fetch_mod_ctx!(db, redis_conn, guild_configs, http, guild_id, user.id);

    let unmute_dm_settings_opt = settings.moderation_dms.and_then(|m| m.unmute);

    send_mod_dm!(
        http,
        user.id,
        unmute_dm_settings_opt,
        "unmute",
        |text| replace_basic_placeholder(text, &gctx, &member, &moderator),
        CreateEmbed::new()
            .title(format!("You have been unmuted from {}!", gctx.name))
            .color(0xFFC54F)
            .footer(CreateEmbedFooter::new(MODERATION_FOOTER))
    );

    debug!("Removing timeout via Discord HTTP API");
    member.enable_communication(http).await?;

    log_moderation_action(
        db, guild_id, Some(&user), &moderator, None, "unmute", None,
    ).await?;

    info!("Successfully unmuted user in guild");
    Ok(())
}

/// Core logic for issuing a softban (ban + immediate unban to clear messages)
#[instrument(skip(db, redis_conn, guild_configs, http), fields(guild_id = %guild_id, user_id = %user.id, moderator_id = %moderator.id
))]
pub async fn issue_softban(
    db: &PgPool,
    redis_conn: &Client,
    guild_configs: &moka::future::Cache<i64, GuildSettings>,
    http: &Arc<Http>,
    guild_id: GuildId,
    user: User,
    moderator: User,
    reason: &str,
    dmd: u8,
) -> Result<(), Error> {
    debug!("Retrieving moderation context for softban");
    let (gctx, member, settings) = fetch_mod_ctx!(db, redis_conn, guild_configs, http, guild_id, user.id);

    let softban_dm_settings_opt = settings.moderation_dms.and_then(|m| m.softban);

    send_mod_dm!(
        http,
        user.id,
        softban_dm_settings_opt,
        "softban",
        |text| replace_reason_placeholders(text, &gctx, &member, reason, &moderator),
        CreateEmbed::new()
            .title(format!("You have been soft-banned from {}", gctx.name))
            .color(0xFF4747)
            .field("Reason", reason, false)
            .field(
                "Notice",
                "You have been banned and immediately unbanned to purge your messages.",
                false
            )
            .thumbnail(&gctx.icon_url)
            .footer(CreateEmbedFooter::new(MODERATION_FOOTER))
    );

    debug!("Executing temporary ban for softban via Discord HTTP API");
    guild_id.ban_with_reason(http, user.id, dmd, reason).await?;

    debug!("Executing immediate unban for softban via Discord HTTP API");
    guild_id.unban(http, user.id).await?;

    log_moderation_action(
        db, guild_id, Some(&user), &moderator, Some(reason), "softban", None,
    ).await?;

    info!("Successfully soft-banned user from guild");
    Ok(())
}

/// Deletes a warning from the database, builds and sends the appropriate DM (custom or default).
/// Returns `Some((target_user_id, reason))` if deleted, or `None` if the warning didn't exist.
#[instrument(skip(db, redis_conn, guild_configs, http), fields(guild_id = %guild_id_raw, warning_id = id, moderator_id = %author.id
))]
pub async fn issue_delete_warning(
    db: &PgPool,
    redis_conn: &Client,
    guild_configs: &moka::future::Cache<i64, GuildSettings>,
    http: &Arc<Http>,
    guild_id_raw: GuildId,
    id: i64,
    author: &User,
) -> Result<Option<(u64, String)>, Error> {
    let guild_id = guild_id_raw.get() as i64;

    debug!("Deleting warning record from database");
    let Some(row) = delete_warn(db, id, guild_id).await? else {
        debug!("Warning record not found; skipping deletion");
        return Ok(None);
    };

    let target_user_id = row.user_id as u64;
    let user_id = UserId::new(target_user_id);
    let reason = row.reason.unwrap_or_else(|| "No reason specified.".to_string());

    debug!(target_user_id, "Record deleted; retrieving context for warning deletion message");

    let (gctx, member, settings) = fetch_mod_ctx!(
        db,
        redis_conn,
        guild_configs,
        http,
        guild_id_raw,
        user_id
    );
    let user = &member.user;

    let dm_settings_opt = settings.moderation_dms.and_then(|m| m.unpardon_delete_warn);

    send_mod_dm!(
        http,
        user,
        dm_settings_opt,
        "delete_warning",
        |text| {
            replace_basic_placeholder(
                text,
                &gctx,
                &member,
                author,
            )
        },
        CreateEmbed::new()
            .title(format!(
                "Your warning at {} has been permanently deleted.",
                gctx.name
            ))
            .field("Warning Reason", &reason, false)
            .field("Warning ID", id.to_string(), false)
            .color(0x48F767)
            .thumbnail(&gctx.icon_url)
    );

    info!(target_user_id, "Successfully processed warning deletion");
    Ok(Some((target_user_id, reason)))
}

/// Updates the active status of a warning, handles the custom/default DMs.
/// Returns `Some((target_user_id, reason))` if successful, or `None` if the warning wasn't found.
#[instrument(skip(db, redis_conn, guild_configs, http), fields(guild_id = %guild_id_raw, warning_id = id, set_active, moderator_id = %author.id
))]
pub async fn issue_warning_status_change(
    db: &PgPool,
    redis_conn: &Client,
    guild_configs: &moka::future::Cache<i64, GuildSettings>,
    http: &Arc<Http>,
    guild_id_raw: GuildId,
    id: i64,
    set_active: bool,
    author: &User,
) -> Result<Option<(u64, String)>, Error> {
    let guild_id = guild_id_raw.get() as i64;
    let expected_current_state = !set_active;

    debug!("Updating warning status in database");
    let Some(row) = update_warn(db, set_active, id, guild_id, expected_current_state).await? else {
        debug!("Warning record not found; skipping update");
        return Ok(None);
    };

    let target_user_id = row.user_id as u64;
    let user_id = UserId::new(target_user_id);
    let reason = row.reason.unwrap_or_else(|| "No reason specified.".to_string());

    debug!(target_user_id, "Warning updated; retrieving context for DM");

    let (gctx, member, settings) = fetch_mod_ctx!(
        db,
        redis_conn,
        guild_configs,
        http,
        guild_id_raw,
        user_id
    );
    let user = &member.user;

    let (action_past_tense, _, color) = if set_active {
        ("unpardoned", ActionType::Unpardon, 0xFF5757)
    } else {
        ("pardoned", ActionType::Pardon, 0x2AB83C)
    };

    log_moderation_action(
        db, guild_id_raw, Some(&user), &author, None, action_past_tense, None,
    ).await?;

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
        |text| {
            replace_basic_placeholder(
                text,
                &gctx,
                &member,
                author,
            )
        },
        CreateEmbed::new()
            .title(format!(
                "Your warning at {} has been {}.",
                gctx.name, action_past_tense
            ))
            .field("Warning Reason", &reason, false)
            .field("Warning ID", id.to_string(), false)
            .color(color)
            .thumbnail(&gctx.icon_url)
    );

    info!(target_user_id, action = action_past_tense, "Successfully processed warning status update");
    Ok(Some((target_user_id, reason)))
}