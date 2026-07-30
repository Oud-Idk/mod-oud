use std::time::Duration;
use crate::Error;
use crate::core::config::guild_ctx::{GuildCtx, get_guild_ctx};
use crate::core::config::settings::{GuildSettings, get_settings};
use crate::features::birthday::placeholders::replace_birthday_placeholders;
use crate::features::birthday::types::{BirthdayMember, ExpiredRole, UserBirthdayRecord};
use crate::features::birthday::{BirthdayConfig, announcements, database};
use chrono::{Datelike, Timelike, Utc};
use fred::clients::Client;
use serenity::all::{
    ChannelId, CreateMessage, GuildId, RoleId, UserId,
};
use serenity::client::Context;
use sqlx::PgPool;
use tracing::{debug, error, info, trace, warn};

async fn get_display_name(ctx: &Context, guild_id: GuildId, user_id: UserId) -> String {
    match guild_id.member(&ctx.http, user_id).await {
        Ok(member) => member.display_name().to_string(),
        Err(_) => match ctx.http.get_user(user_id).await {
            Ok(user) => user.name,
            Err(_) => format!("User ({})", user_id),
        },
    }
}

async fn build_celebrants(
    ctx: &Context,
    guild_id: i64,
    birthday_records: Vec<UserBirthdayRecord>,
) -> Vec<BirthdayMember> {
    let target_guild_id = GuildId::new(guild_id as u64);
    let mut celebrants = Vec::new();

    for record in birthday_records {
        let user_id = UserId::new(record.user_id as u64);
        let display_name = get_display_name(ctx, target_guild_id, user_id).await;

        celebrants.push(BirthdayMember {
            user_id,
            display_name,
            birth_year: record.birth_year,
        });
    }

    celebrants
}

pub async fn run_birthday_announcements(
    db: &PgPool,
    redis: &Client,
    guild_configs: &moka::future::Cache<i64, GuildSettings>,
    ctx: &Context,
) -> Result<(), Error> {
    let now = Utc::now();
    let current_hour = now.hour() as i32;
    let current_month = now.month() as i16;
    let current_day = now.day() as i16;
    let current_year = now.year();

    let target_guild_ids = database::fetch_enabled_guild_ids(db, current_hour).await?;

    for guild_id in target_guild_ids {
        let settings = match get_settings(db, redis, guild_configs, guild_id).await {
            Ok(s) => s,
            Err(e) => {
                error!(guild_id, error = %e, "Failed to fetch settings for birthday job");
                continue;
            }
        };

        let birthday_cfg = match &settings.birthday {
            Some(cfg) if cfg.enabled => cfg,
            _ => continue,
        };

        let channel_id = ChannelId::new(birthday_cfg.channel_id);
        let birthday_records = database::get_unannounced_birthdays(db, current_month, current_day, current_year, guild_id).await?;

        if birthday_records.is_empty() {
            continue;
        }

        let celebrants = build_celebrants(ctx, guild_id, birthday_records).await;
        let sent_msg_id = announcements::send_birthday_message(ctx, channel_id, &celebrants, birthday_cfg, guild_id).await;

        announcements::process_celebrant_roles(db, ctx, &celebrants, birthday_cfg, guild_id, channel_id, sent_msg_id, current_year).await;
    }

    Ok(())
}

pub async fn cleanup_expired_birthday_roles(
    pool: &PgPool,
    ctx: &Context,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let expired_roles = database::fetch_expired_birthday_roles(pool).await?;

    if expired_roles.is_empty() {
        return Ok(());
    }

    let mut guild_ids = Vec::with_capacity(expired_roles.len());
    let mut user_ids = Vec::with_capacity(expired_roles.len());

    for record in &expired_roles {
        let guild_id = GuildId::new(record.guild_id as u64);
        let user_id = UserId::new(record.user_id as u64);
        let role_id = RoleId::new(record.role_id as u64);

        let _ = ctx
            .http
            .remove_member_role(guild_id, user_id, role_id, Some("Birthday role expired"))
            .await;

        // Collect the IDs so we can bulk delete from DB after
        guild_ids.push(record.guild_id);
        user_ids.push(record.user_id);
    }

    database::delete_expired_birthday_roles(pool, &guild_ids, &user_ids).await?;

    Ok(())
}


pub fn start_birthday_worker(
    pool: PgPool,
    redis_client: Client,
    guild_configs: moka::future::Cache<i64, GuildSettings>,
    ctx: Context,
) {
    tokio::spawn(async move {
        let lock_key = "lock:birthday_worker";
        let lock_value = format!("worker-{}", Utc::now().timestamp_millis());

        info!(worker_id = %lock_value, "Starting birthday worker task");

        loop {
            tokio::time::sleep(Duration::from_secs(120)).await;

            trace!("Attempting to acquire lock for birthday tasks");

            match crate::shared::locking::acquire_lock(&redis_client, lock_key, &lock_value, 3).await {
                Ok(Some(guard)) => {
                    if let Err(e) = run_birthday_announcements(&pool, &redis_client, &guild_configs, &ctx).await {
                        error!(error = ?e, "Error running birthday announcements");
                    }

                    if let Err(e) = cleanup_expired_birthday_roles(&pool, &ctx).await {
                        error!(error = ?e, "Error cleaning up expired birthday roles");
                    }

                    if let Err(e) = guard.release().await {
                        warn!(error = ?e, "Failed to release birthday worker lock");
                    } else {
                        debug!("Released birthday worker lock successfully");
                    }
                }
                Ok(None) => {
                    trace!("Lock busy; skipping this iteration");
                }
                Err(e) => {
                    error!(error = ?e, "Failed to coordinate Redis lock for birthday worker");
                }
            }
        }
    });
}