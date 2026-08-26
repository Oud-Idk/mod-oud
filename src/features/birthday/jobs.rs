use crate::core::config::settings::{GuildSettings, get_settings};
use crate::core::config::state::Error;
use crate::features::birthday::announcements::BirthdayAnnouncement;
use crate::features::birthday::types::{BirthdayMember, UserBirthdayRecord};
use crate::features::birthday::{announcements, database};
use crate::shared::username_cache::UserUpdate;
use crate::shared::{get_username, store_username_relation};
use chrono::{Datelike, Timelike, Utc};
use chrono_tz::Tz;
use fred::clients::Client;
use futures::StreamExt;
use futures::future::join_all;
use moka::future::Cache;
use serenity::all::{GuildId, UserId};
use serenity::client::Context;
use sqlx::PgPool;
use std::time::Duration;
use tokio::sync::mpsc;
use tracing::{error, info, trace, warn};

async fn get_display_name(
    ctx: &Context,
    db: &PgPool,
    redis: &Client,
    sender: &mpsc::Sender<UserUpdate>,
    guild_id: GuildId,
    user_id: UserId,
) -> String {
    if let Ok(Some(cached_name)) = get_username(db, redis, user_id).await {
        return cached_name;
    }

    let fetched_name = match guild_id.member(&ctx.http, user_id).await {
        Ok(member) => member.display_name().to_string(),
        Err(_) => match ctx.http.get_user(user_id).await {
            Ok(user) => user.name,
            Err(_) => format!("User ({user_id})"),
        },
    };

    let _ = store_username_relation(sender, user_id, &fetched_name).await;

    fetched_name
}

async fn build_celebrants(
    ctx: &Context,
    db: &PgPool,
    redis: &Client,
    guild_id: GuildId,
    username_tx: &mpsc::Sender<UserUpdate>,
    birthday_records: Vec<UserBirthdayRecord>,
) -> Vec<BirthdayMember> {
    let futures = birthday_records.into_iter().map(|record| {
        let user_id = record.user_id;
        async move {
            let display_name =
                get_display_name(ctx, db, redis, username_tx, guild_id, user_id).await;
            BirthdayMember {
                user_id,
                display_name,
                birth_year: record.birth_year,
            }
        }
    });

    join_all(futures).await
}

pub async fn run_birthday_announcements(
    db: &PgPool,
    redis: &Client,
    username_tx: &mpsc::Sender<UserUpdate>,
    guild_configs: &Cache<GuildId, GuildSettings>,
    ctx: &Context,
) -> Result<(), Error> {
    let now = Utc::now();

    // Fetch guilds whose announcement_hour matches current_hour UTC
    let target_guild_ids = database::fetch_enabled_guild_ids(db, now.hour()).await?;

    futures::stream::iter(target_guild_ids)
        .for_each_concurrent(10, |guild_id| async move {
            let settings = match get_settings(db, redis, guild_configs, guild_id).await {
                Ok(s) => s,
                Err(e) => {
                    error!(%guild_id, error = %e, "Failed to fetch settings for birthday job");
                    return;
                }
            };

            let birthday_cfg = match &settings.birthday {
                Some(cfg) if cfg.enabled => cfg,
                _ => return,
            };

            // Parse timezone string into chrono_tz::Tz, falling back to UTC if invalid
            let tz: Tz = birthday_cfg.timezone.parse().unwrap_or_else(|_| {
                warn!(
                    %guild_id,
                    tz = %birthday_cfg.timezone,
                    "Invalid timezone in config, falling back to UTC"
                );
                chrono_tz::UTC
            });

            let local_now = now.with_timezone(&tz);

            let guild_month =
                i16::try_from(local_now.month()).expect("There are only 12 days in a year");
            let guild_day =
                i16::try_from(local_now.day()).expect("There are at most 31 days in a month");
            let guild_year = local_now.year();

            let Some(channel_id) = birthday_cfg.channel_id else {
                warn!("Channel ID is empty, skipping guild {}", guild_id);
                return;
            };

            let birthday_records = match database::get_unannounced_birthdays(
                db,
                guild_month,
                guild_day,
                guild_year,
                guild_id,
            )
            .await
            {
                Ok(records) => records,
                Err(e) => {
                    error!(%guild_id, error = %e, "Failed to get unannounced birthdays");
                    return;
                }
            };

            if birthday_records.is_empty() {
                return;
            }

            let celebrants =
                build_celebrants(ctx, db, redis, guild_id, username_tx, birthday_records).await;
            let sent_msg_id = announcements::send_birthday_message(
                ctx,
                channel_id,
                &celebrants,
                birthday_cfg,
                guild_id,
            )
            .await
            .inspect_err(|e| warn!(error = ?e, "Failed to send birthday messages!"))
            .ok()
            .map(|m| m.id);

            let payload = BirthdayAnnouncement {
                guild_id,
                channel_id,
                sent_msg_id,
                celebrants: &celebrants,
                current_year: guild_year,
            };

            announcements::process_celebrant_roles(db, ctx, birthday_cfg, payload).await;
        })
        .await;

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

    // Separate guild_ids and user_ids
    let (guild_ids, user_ids): (Vec<GuildId>, Vec<UserId>) = expired_roles
        .iter()
        .map(|r| (r.guild_id, r.user_id))
        .unzip();

    futures::stream::iter(expired_roles)
        .for_each_concurrent(10, |record| async move {
            let guild_id = record.guild_id;
            let user_id = record.user_id;
            let role_id = record.role_id;

            let _ = ctx
                .http
                .remove_member_role(guild_id, user_id, role_id, Some("Birthday role expired"))
                .await;
        })
        .await;

    database::delete_expired_birthday_roles(pool, &guild_ids, &user_ids).await?;

    Ok(())
}

/// Spawns a background worker that runs birthday announcements and cleans up expired birthday roles.
pub fn start_birthday_worker(
    pool: PgPool,
    redis_client: Client,
    guild_configs: Cache<GuildId, GuildSettings>,
    username_tx: mpsc::Sender<UserUpdate>,
    ctx: Context,
) {
    tokio::spawn(async move {
        let lock_key = "lock:birthday_worker";
        let lock_value = format!("worker-{}", Utc::now().timestamp_millis());

        info!(worker_id = %lock_value, "Starting birthday worker task");

        loop {
            tokio::time::sleep(Duration::from_mins(2)).await;

            trace!("Attempting to acquire lock for birthday tasks");

            match crate::shared::locking::acquire_lock(&redis_client, lock_key, &lock_value, 3)
                .await
            {
                Ok(Some(guard)) => {
                    if let Err(e) = run_birthday_announcements(
                        &pool,
                        &redis_client,
                        &username_tx,
                        &guild_configs,
                        &ctx,
                    )
                    .await
                    {
                        error!(error = ?e, "Error running birthday announcements");
                    }

                    if let Err(e) = cleanup_expired_birthday_roles(&pool, &ctx).await {
                        error!(error = ?e, "Error cleaning up expired birthday roles");
                    }

                    if let Err(e) = guard.release().await {
                        warn!(error = ?e, "Failed to release birthday worker lock");
                    } else {
                        trace!("Released birthday worker lock successfully");
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
