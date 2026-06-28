use crate::commands::moderation::warn::database::{delete_warn, update_warn};
use crate::core::config::{get_guild_ctx, get_settings};
use crate::types::config::config::{Format, GuildSettings};
use crate::types::Error;
use crate::utils::custom_msg::build_custom_message;
use crate::utils::logger::ActionType;
use crate::utils::placeholders::{replace_ban_placeholders, replace_basic_placeholder, replace_kick_placeholder, replace_mute_placeholder, replace_reason_placeholders};
use duration_str::HumanFormat;
use fred::prelude::Client;
use poise::serenity_prelude as serenity;
use serenity::all::{CreateEmbed, CreateEmbedFooter, CreateInvite, CreateMessage};
use std::sync::Arc;
use std::time::Duration;

const MODERATION_FOOTER: &str = "This is an automated moderation action. If you believe this was a mistake, please create a ticket on the server.";

/// Helper macro to fetch common moderation context (Guild Context, Member, Settings)
macro_rules! fetch_mod_ctx {
    ($db:expr, $redis_conn:expr, $config_cache:expr, $http:expr, $guild_id:expr, $user_id:expr) => {{
        let gctx_fut = async {
            get_guild_ctx($guild_id, $http.as_ref()).await
                .map_err(|e| -> crate::types::Error { e.into() })
        };

        let member_fut = async {
            $http.get_member($guild_id, $user_id).await
                .map_err(|e| -> crate::types::Error { e.into() })
        };

        let settings_fut = async {
            get_settings($db, $redis_conn, $config_cache, $guild_id.get() as i64).await
                .map_err(|e| -> crate::types::Error { e.into() })
        };

        tokio::try_join!(gctx_fut, member_fut, settings_fut)?
    }};
}

/// Helper macro to handle building, falling back, and sending moderation DMs
macro_rules! send_mod_dm {
    (
        $http:expr,
        $user_id:expr,
        $dm_settings_opt:expr,
        $action_name:expr,
        $replace_closure:expr,
        $default_embed_block:expr
    ) => {{
        let mut custom_msg_opt = None;

        if let Some(dm_settings) = $dm_settings_opt {
            if dm_settings.enabled {
                let is_embed = matches!(dm_settings.format, Format::Embed);

                custom_msg_opt = build_custom_message(
                    is_embed,
                    Some(&dm_settings.content),
                    dm_settings.embed.as_ref(),
                    $replace_closure,
                ).unwrap_or_else(|e| {
                    eprintln!("Failed to build custom {} message: {}", $action_name, e);
                    None
                });
            }
        }

        let dm_message = custom_msg_opt.unwrap_or_else(|| {
            CreateMessage::new().embed($default_embed_block)
        });

        let _ = $user_id.dm($http, dm_message).await;
    }};
}

pub async fn issue_warning(
    db: &sqlx::PgPool,
    redis_conn: &Client,
    guild_configs: &moka::future::Cache<i64, GuildSettings>,
    http: &Arc<serenity::Http>,
    guild_id: serenity::GuildId,
    user_id: serenity::UserId,
    moderator_id: serenity::UserId,
    reason: &str,
) -> Result<i64, Error> {
    let warn_res = sqlx::query!(
        r#"INSERT INTO warns (guild_id, user_id, moderator_id, reason) VALUES ($1, $2, $3, $4) RETURNING id"#,
        guild_id.get() as i64, user_id.get() as i64, moderator_id.get() as i64, reason
    ).fetch_one(db).await?;
    let warn_id = warn_res.id;

    let (gctx, member, settings) = fetch_mod_ctx!(db, redis_conn, guild_configs, http, guild_id, user_id);
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

    Ok(warn_id as i64)
}

/// Core logic for issuing a kick, fetching custom settings, and sending DMs
pub async fn issue_kick(
    db: &sqlx::PgPool,
    redis_conn: &Client,
    guild_configs: &moka::future::Cache<i64, GuildSettings>,
    http: &Arc<serenity::all::Http>,
    guild_id: serenity::all::GuildId,
    channel_id: serenity::all::ChannelId,
    user: serenity::all::User,
    moderator: serenity::all::User,
    reason: &str,
) -> Result<(), Error> {
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
            let builder = CreateInvite::default()
                .max_age(86400) // 24 hrs
                .max_uses(1)
                .unique(true);

            if let Ok(invite) = channel_id.create_invite(http, builder).await {
                invite_url = Some(format!("https://discord.gg/{}", invite.code));
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

    // Actually kick the user
    guild_id.kick_with_reason(http, user.id, reason).await?;

    Ok(())
}


pub async fn issue_ban(
    db: &sqlx::PgPool,
    redis_conn: &Client,
    guild_configs: &moka::future::Cache<i64, GuildSettings>,
    http: &Arc<serenity::all::Http>,
    guild_id: serenity::all::GuildId,
    user: serenity::all::User,
    moderator: serenity::all::User,
    reason: &str,
    dmd_time: u8,
    duration: Option<Duration>,
    duration_label: &str,
) -> Result<(), Error> {
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

    guild_id.ban_with_reason(http, user.id, dmd_time, reason).await?;

    if let Some(dur) = duration {
        let chrono_dur = chrono::Duration::from_std(dur).map_err(|_| "Time overflowed")?;
        let unban_at = chrono::Utc::now() + chrono_dur;

        sqlx::query!(
            "INSERT INTO temp_bans (guild_id, user_id, unban_at) VALUES ($1, $2, $3)",
            guild_id.get() as i64,
            user.id.get() as i64,
            unban_at
        )
            .execute(db)
            .await?;
    }

    Ok(())
}

pub async fn issue_mute(
    db: &sqlx::PgPool,
    redis_conn: &Client,
    guild_configs: &moka::future::Cache<i64, GuildSettings>,
    http: &Arc<serenity::all::Http>,
    guild_id: serenity::all::GuildId,
    user: serenity::all::User,
    moderator: serenity::all::User,
    reason: &str,
    duration: &Duration,
    timestamp: serenity::all::Timestamp,
) -> Result<(), Error> {
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

    // 3. Actually mute (timeout) the user via Discord API
    member.disable_communication_until_datetime(http, timestamp).await?;

    Ok(())
}

pub async fn issue_unmute(
    db: &sqlx::PgPool,
    redis_conn: &Client,
    guild_configs: &moka::future::Cache<i64, GuildSettings>,
    http: &Arc<serenity::all::Http>,
    guild_id: serenity::all::GuildId,
    user: serenity::all::User,
    moderator: serenity::all::User,
) -> Result<(), Error> {
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
            .color(0xFFC54F) // Matching your yellow-orange color
            .footer(CreateEmbedFooter::new(MODERATION_FOOTER))
    );

    // 3. Actually unmute the user via Discord API
    member.enable_communication(http).await?;

    Ok(())
}

/// Core logic for issuing a softban (ban + immediate unban to clear messages)
pub async fn issue_softban(
    db: &sqlx::PgPool,
    redis_conn: &Client,
    guild_configs: &moka::future::Cache<i64, GuildSettings>,
    http: &Arc<serenity::all::Http>,
    guild_id: serenity::all::GuildId,
    user: serenity::all::User,
    moderator: serenity::all::User,
    reason: &str,
    dmd: u8,
) -> Result<(), Error> {
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

    guild_id.ban_with_reason(http, user.id, dmd, reason).await?;
    guild_id.unban(http, user.id).await?;

    Ok(())
}

/// Deletes a warning from the database, builds and sends the appropriate DM (custom or default).
/// Returns `Some((target_user_id, reason))` if deleted, or `None` if the warning didn't exist.
pub async fn issue_delete_warning(
    db: &sqlx::PgPool,
    redis_conn: &Client,
    guild_configs: &moka::future::Cache<i64, GuildSettings>,
    http: &Arc<serenity::all::Http>,
    guild_id_raw: serenity::all::GuildId,
    id: i32,
    author: &serenity::all::User,
) -> Result<Option<(u64, String)>, Error> {
    let guild_id = guild_id_raw.get() as i64;

    let Some(row) = delete_warn(db, id, guild_id).await? else {
        return Ok(None);
    };

    let target_user_id = row.user_id as u64;
    let user_id = serenity::UserId::new(target_user_id);
    let reason = row.reason.unwrap_or_else(|| "No reason specified.".to_string());

    let gctx = get_guild_ctx(guild_id_raw, http.as_ref()).await?;
    let member = http.get_member(guild_id_raw, user_id).await?;
    let user = &member.user;

    let settings = get_settings(db, redis_conn, guild_configs, guild_id).await?;
    let dm_settings_opt = settings.moderation_dms.and_then(|m| m.unpardon_delete_warn);

    let mut custom_msg_opt = None;
    if let Some(dm_settings) = dm_settings_opt {
        let is_embed = matches!(dm_settings.format, Format::Embed);

        custom_msg_opt = build_custom_message(
            is_embed,
            Some(&dm_settings.content),
            dm_settings.embed.as_ref(),
            |text| {
                replace_basic_placeholder(
                    text,
                    &gctx,
                    &member,
                    author,
                )
            },
        ).unwrap_or_else(|e| {
            eprintln!("Failed to build custom warning deletion message: {}", e);
            None
        });
    }

    // 4. Default DM fallback layout
    let message = custom_msg_opt.unwrap_or_else(|| {
        let embed = CreateEmbed::new()
            .title(format!(
                "Your warning at {} has been permanently deleted.",
                gctx.name
            ))
            .field("Warning Reason", &reason, false)
            .field("Warning ID", id.to_string(), false)
            .color(0x48F767)
            .thumbnail(&gctx.icon_url);
        CreateMessage::new().embed(embed)
    });

    // 5. Send the DM (ignore failures, the user might have DMs closed)
    let _ = user.dm(http, message).await;

    Ok(Some((target_user_id, reason)))
}

/// Updates the active status of a warning, handles the custom/default DMs.
/// Returns `Some((target_user_id, reason))` if successful, or `None` if the warning wasn't found.
pub async fn issue_warning_status_change(
    db: &sqlx::PgPool,
    redis_conn: &Client,
    guild_configs: &moka::future::Cache<i64, GuildSettings>,
    http: &Arc<serenity::all::Http>,
    guild_id_raw: serenity::all::GuildId,
    id: i32,
    set_active: bool,
    author: &serenity::all::User,
) -> Result<Option<(u64, String)>, Error> {
    let guild_id = guild_id_raw.get() as i64;
    let expected_current_state = !set_active;

    // 1. Database Update
    let Some(row) = update_warn(db, set_active, id, guild_id, expected_current_state).await? else {
        return Ok(None);
    };

    let target_user_id = row.user_id as u64;
    let user_id = serenity::UserId::new(target_user_id);
    let reason = row.reason.unwrap_or_else(|| "No reason specified.".to_string());

    // 2. Fetch cache/HTTP contexts safely without poise context
    let gctx = get_guild_ctx(guild_id_raw, http.as_ref()).await?;
    let member = http.get_member(guild_id_raw, user_id).await?;
    let user = &member.user;

    // Determine values for DM based on target status
    let (action_past_tense, _, color) = if set_active {
        ("unpardoned", ActionType::Unpardon, 0xFF5757)
    } else {
        ("pardoned", ActionType::Pardon, 0x2AB83C)
    };

    // 3. Fetch custom DM settings
    let settings = get_settings(db, redis_conn, guild_configs, guild_id).await?;
    let dm_settings_opt = if set_active {
        settings.moderation_dms.and_then(|m| m.unpardon_warn)
    } else {
        settings.moderation_dms.and_then(|m| m.pardon_warn)
    };

    let mut custom_msg_opt = None;
    if let Some(dm_settings) = dm_settings_opt {
        let is_embed = matches!(dm_settings.format, Format::Embed);

        custom_msg_opt = build_custom_message(
            is_embed,
            Some(&dm_settings.content),
            dm_settings.embed.as_ref(),
            |text| {
                replace_basic_placeholder(
                    text,
                    &gctx,
                    &member,
                    author,
                )
            },
        ).unwrap_or_else(|e| {
            eprintln!("Failed to build custom warning status message: {}", e);
            None
        });
    }

    // 4. Default DM fallback layout
    let message = custom_msg_opt.unwrap_or_else(|| {
        let embed = CreateEmbed::new()
            .title(format!(
                "Your warning at {} has been {}.",
                gctx.name, action_past_tense
            ))
            .field("Warning Reason", &reason, false)
            .field("Warning ID", id.to_string(), false)
            .color(color)
            .thumbnail(&gctx.icon_url);
        CreateMessage::new().embed(embed)
    });

    let _ = user.dm(http, message).await;

    Ok(Some((target_user_id, reason)))
}