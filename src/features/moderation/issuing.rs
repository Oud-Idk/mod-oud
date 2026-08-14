use crate::core::config::guild_ctx::get_guild_ctx;
use crate::core::config::settings::GuildSettings;
use crate::core::config::settings::get_settings;
use crate::features::moderation::ActionType;
use crate::features::moderation::database::log_moderation_action;
use crate::features::moderation::placeholders::{replace_ban_placeholders, replace_basic_placeholder, replace_kick_placeholder, replace_mute_placeholder, replace_reason_placeholders};
use crate::features::moderation::types::MODERATION_FOOTER;
use crate::shared::embed::build_custom_message;
use crate::{fetch_mod_ctx, send_mod_dm};
use anyhow::Result;
use chrono::TimeDelta;
use duration_str::HumanFormat;
use fred::clients::Client;
use humantime::format_duration;
use serenity::all::{ChannelId, CreateEmbed, CreateEmbedFooter, CreateInvite, CreateMessage, GuildId, Http, Timestamp, User};
use sqlx::PgPool;
use std::sync::Arc;
use std::time::Duration;
use tracing::{debug, info, instrument, warn};

#[instrument(skip(db, redis_conn, guild_configs, http), fields(guild_id = %guild_id, user_id = %user.id, moderator_id = %moderator.id
))]
pub async fn issue_kick(
    db: &PgPool,
    redis_conn: &Client,
    guild_configs: &moka::future::Cache<u64, GuildSettings>,
    http: &Arc<Http>,
    guild_id: GuildId,
    channel_id: ChannelId,
    user: User,
    moderator: User,
    reason: &str,
) -> Result<()> {
    debug!("Retrieving moderation context for kick");
    let (gctx, member, settings) = fetch_mod_ctx!(db, redis_conn, guild_configs, http, guild_id, user.id);

    let kick_dm_settings_opt = settings.moderation_dms.and_then(|m| m.kick);
    let mut invite_url = None;

    if let Some(kick_dm_settings) = &kick_dm_settings_opt {
        // Adjusted to traverse through `message` block and handle non-optional embed struct
        let contains_invite = kick_dm_settings.message.content.contains("invite.url")
            || kick_dm_settings.message.embed.description.as_ref().is_some_and(|d| d.contains("invite.url"))
            || kick_dm_settings.message.embed.title.as_ref().is_some_and(|t| t.contains("invite.url"));

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
        "KICK",
        |text| replace_kick_placeholder(
            text,
            &gctx,
            &member,
            reason,
            &moderator,
            invite_url.as_deref(),
        ),
        {
            let mut embed = CreateEmbed::new()
                .title(format!("You have been kicked from {}", gctx.name))
                .color(0xff8a42)
                .field("Reason", reason, false)
                .footer(CreateEmbedFooter::new(MODERATION_FOOTER));

            if let Some(url) = &gctx.icon_url {
                embed = embed.thumbnail(url);
            }

            embed
        }
    );

    log_moderation_action(
        db, guild_id, Some(&user), &moderator, Some(reason), ActionType::Kick, None
    ).await?;

    debug!("Executing kick via Discord HTTP API");
    guild_id.kick_with_reason(http, user.id, reason).await?;

    info!("Successfully kicked user from guild");
    Ok(())
}

/// Bans a user from the guild, optionally sending a DM and scheduling an unban.
#[instrument(skip(db, redis_conn, guild_configs, http), fields(guild_id = %guild_id, user_id = %user.id, moderator_id = %moderator.id, duration_label
))]
pub async fn issue_ban(
    db: &PgPool,
    redis_conn: &Client,
    guild_configs: &moka::future::Cache<u64, GuildSettings>,
    http: &Arc<Http>,
    guild_id: GuildId,
    user: User,
    moderator: User,
    reason: &str,
    dmd_time: u8,
    duration: Option<Duration>,
    _duration_label: &str,
) -> Result<()> {
    debug!("Retrieving moderation context for ban");
    let (gctx, member, settings) = fetch_mod_ctx!(db, redis_conn, guild_configs, http, guild_id, user.id);
    let ban_dm_settings_opt = settings.moderation_dms.and_then(|m| m.ban);
    let duration_label = duration.map_or("Permanent".to_string(), |d| format_duration(d).to_string());

    send_mod_dm!(
        http,
        user.id,
        ban_dm_settings_opt,
        "BAN",
        |text| replace_ban_placeholders(text, &gctx, &member, reason, &moderator),
        {
            let mut embed = CreateEmbed::new()
                .title(format!("You have been banned from {}", gctx.name))
                .color(0xFF4747)
                .field("Reason", reason, false)
                .field("Duration", duration_label, false)
                .footer(CreateEmbedFooter::new(MODERATION_FOOTER));

            if let Some(url) = &gctx.icon_url {
                embed = embed.thumbnail(url);
            }

            embed
        }
    );

    debug!("Executing ban via Discord HTTP API");
    guild_id.ban_with_reason(http, user.id, dmd_time, reason).await?;

    let mut dur: Option<TimeDelta> = None;

    if let Some(duration) = duration {
        debug!("Ban is scheduled; registering unban timeout in database");

        dur = Some(schedule_unban(db, guild_id, &user, duration).await?);
    }

    log_moderation_action(
        db, guild_id, Some(&user), &moderator, Some(reason), ActionType::Ban, dur
    ).await?;


    info!("Successfully banned user from guild");
    Ok(())
}

/// Schedules an automatic unban for the given user after `dur` has elapsed.
pub async fn schedule_unban(db: &PgPool, guild_id: GuildId, user: &User, dur: Duration) -> Result<TimeDelta> {
    let chrono_dur = chrono::Duration::from_std(dur)?;
    let unban_at = chrono::Utc::now() + chrono_dur;

    sqlx::query!(
            "INSERT INTO temp_bans (guild_id, user_id, unban_at) VALUES ($1, $2, $3)",
            guild_id.get().cast_signed(),
            user.id.get() as i64,
            unban_at
        )
        .execute(db)
        .await?;
    Ok(chrono_dur)
}

/// Times out (mutes) a user for the given duration, optionally sending a DM.
#[instrument(skip(db, redis_conn, guild_configs, http, user), fields(guild_id = %guild_id, user_id = %user.id, moderator_id = %moderator.id
))]
pub async fn issue_mute(
    db: &PgPool,
    redis_conn: &Client,
    guild_configs: &moka::future::Cache<u64, GuildSettings>,
    http: &Arc<Http>,
    guild_id: GuildId,
    user: User,
    moderator: User,
    reason: &str,
    duration: &Duration,
    timestamp: Timestamp,
) -> Result<()> {
    debug!("Retrieving moderation context for timeout");
    let (gctx, mut member, settings) = fetch_mod_ctx!(db, redis_conn, guild_configs, http, guild_id, user.id);

    let mute_dm_settings_opt = settings.moderation_dms.and_then(|m| m.mute);

    send_mod_dm!(
        http,
        user.id,
        mute_dm_settings_opt,
        "MUTE",
        |text| replace_mute_placeholder(text, &gctx, &member, reason, &moderator, duration),
        {
            let mut embed = CreateEmbed::new()
                .title(format!("You have been muted from {}", gctx.name))
                .color(0xFFC54F)
                .field("Reason", reason, false)
                .field("Duration", duration.human_format(), false)
                .footer(CreateEmbedFooter::new(MODERATION_FOOTER));

            if let Some(url) = &gctx.icon_url {
                embed = embed.thumbnail(url);
            }

            embed
        }
    );

    debug!(until = %timestamp, "Applying timeout via Discord HTTP API");
    member.disable_communication_until_datetime(http, timestamp).await?;

    let timedelta = TimeDelta::from_std(*duration)?;

    log_moderation_action(
        db, guild_id, Some(&user), &moderator, Some(reason), ActionType::Mute, Some(timedelta),
    ).await?;

    info!("Successfully muted user in guild");
    Ok(())
}

#[instrument(skip(db, redis_conn, guild_configs, http, user), fields(guild_id = %guild_id, user_id = %user.id, moderator_id = %moderator.id
))]
pub async fn issue_unmute(
    db: &PgPool,
    redis_conn: &Client,
    guild_configs: &moka::future::Cache<u64, GuildSettings>,
    http: &Arc<Http>,
    guild_id: GuildId,
    user: User,
    moderator: User,
) -> Result<()> {
    debug!("Retrieving moderation context for unmute");
    let (gctx, mut member, settings) = fetch_mod_ctx!(db, redis_conn, guild_configs, http, guild_id, user.id);

    let unmute_dm_settings_opt = settings.moderation_dms.and_then(|m| m.unmute);

    send_mod_dm!(
        http,
        user.id,
        unmute_dm_settings_opt,
        "UNMUTE",
        |text| replace_basic_placeholder(text, &gctx, &member, &moderator),
        CreateEmbed::new()
            .title(format!("You have been unmuted from {}!", gctx.name))
            .color(0xFFC54F)
            .footer(CreateEmbedFooter::new(MODERATION_FOOTER))
    );

    debug!("Removing timeout via Discord HTTP API");
    member.enable_communication(http).await?;

    log_moderation_action(
        db, guild_id, Some(&user), &moderator, None, ActionType::Unmute, None,
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
    guild_configs: &moka::future::Cache<u64, GuildSettings>,
    http: &Arc<Http>,
    guild_id: GuildId,
    user: User,
    moderator: User,
    reason: &str,
    dmd: u8,
) -> Result<()> {
    debug!("Retrieving moderation context for softban");
    let (gctx, member, settings) = fetch_mod_ctx!(db, redis_conn, guild_configs, http, guild_id, user.id);

    let softban_dm_settings_opt = settings.moderation_dms.and_then(|m| m.softban);

    send_mod_dm!(
        http,
        user.id,
        softban_dm_settings_opt,
        "SOFTBAN",
        |text| replace_reason_placeholders(text, &gctx, &member, reason, &moderator),
        {
            let mut embed = CreateEmbed::new()
                .title(format!("You have been soft-banned from {}", gctx.name))
                .color(0xFF4747)
                .field("Reason", reason, false)
                .field(
                    "Notice",
                    "You have been banned and immediately unbanned to purge your messages.",
                    false
                )
                .footer(CreateEmbedFooter::new(MODERATION_FOOTER));

            if let Some(url) = &gctx.icon_url {
                embed = embed.thumbnail(url);
            }

            embed
        }
    );

    debug!("Executing temporary ban for softban via Discord HTTP API");
    guild_id.ban_with_reason(http, user.id, dmd, reason).await?;

    debug!("Executing immediate unban for softban via Discord HTTP API");
    guild_id.unban(http, user.id).await?;

    log_moderation_action(
        db, guild_id, Some(&user), &moderator, Some(reason), ActionType::Softban, None,
    ).await?;

    info!("Successfully soft-banned user from guild");
    Ok(())
}