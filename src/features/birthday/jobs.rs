use crate::core::config::settings::{GuildSettings, get_settings};
use crate::core::config::state::Error;
use crate::features::birthday::announcements::BirthdayAnnouncement;
use crate::features::birthday::types::{BirthdayMember, UserBirthdayRecord};
use crate::features::birthday::{BirthdayConfig, announcements, database};
use crate::shared::username_cache::UserUpdate;
use crate::shared::{get_username, store_username_relation};
use chrono::{DateTime, Datelike, Timelike, Utc};
use chrono_tz::Tz;
use fred::clients::Client;
use futures::StreamExt;
use futures::future::join_all;
use moka::future::Cache;
use serenity::all::{ChannelId, GuildId, UserId};
use serenity::client::Context;
use sqlx::PgPool;
use std::time::Duration;
use tokio::sync::mpsc;
use tracing::{debug, error, info, instrument, trace, warn};

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
        Err(member_err) => match ctx.http.get_user(user_id).await {
            Ok(user) => {
                // Usually a user who left the guild, so the account name is used.
                warn!(
                    %guild_id,
                    %user_id,
                    error = ?member_err,
                    "Guild member lookup failed for a birthday celebrant; falling back to the \
                     account username"
                );
                user.name
            }
            Err(user_err) => {
                // The raw-id placeholder is announced publicly.
                warn!(
                    %guild_id,
                    %user_id,
                    error = ?user_err,
                    member_error = ?member_err,
                    "User lookup failed for a birthday celebrant; announcing the raw id placeholder"
                );
                format!("User ({user_id})")
            }
        },
    };

    if let Err(e) = store_username_relation(sender, user_id, &fetched_name).await {
        warn!(error = ?e, %user_id, "Failed to queue username update for birthday announcement");
    }

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
        .for_each_concurrent(10, |guild_id| {
            announce_for_guild(db, redis, username_tx, guild_configs, ctx, guild_id, now)
        })
        .await;

    Ok(())
}

/// Runs the birthday flow for one guild.
async fn announce_for_guild(
    db: &PgPool,
    redis: &Client,
    username_tx: &mpsc::Sender<UserUpdate>,
    guild_configs: &Cache<GuildId, GuildSettings>,
    ctx: &Context,
    guild_id: GuildId,
    now: DateTime<Utc>,
) {
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
    let guild_year = local_now.year();

    let Some(channel_id) = birthday_cfg.channel_id else {
        // This guild is skipped on every run, so a missing channel means no output at all.
        warn!(
            %guild_id,
            tz = %birthday_cfg.timezone,
            "Birthday announcement channel is not configured for this guild; nothing is \
             announced on any run"
        );
        return;
    };

    let Some(celebrants) =
        unannounced_celebrants(db, redis, username_tx, ctx, guild_id, local_now).await
    else {
        return;
    };

    announce_celebrants(
        db,
        ctx,
        birthday_cfg,
        guild_id,
        channel_id,
        guild_year,
        celebrants,
    )
    .await;
}

/// Resolves the guild's unannounced birthdays for its local date into display-ready celebrants.
///
/// `None` covers both "nothing to announce" and "the lookup failed". The `debug!` below is what
/// tells a quiet day apart from a bad `timezone` or `announcement_hour`.
async fn unannounced_celebrants(
    db: &PgPool,
    redis: &Client,
    username_tx: &mpsc::Sender<UserUpdate>,
    ctx: &Context,
    guild_id: GuildId,
    local_now: DateTime<Tz>,
) -> Option<Vec<BirthdayMember>> {
    let guild_month = i16::try_from(local_now.month()).expect("There are only 12 days in a year");
    let guild_day = i16::try_from(local_now.day()).expect("There are at most 31 days in a month");
    let guild_year = local_now.year();

    let birthday_records =
        match database::get_unannounced_birthdays(db, guild_month, guild_day, guild_year, guild_id)
            .await
        {
            Ok(records) => records,
            Err(e) => {
                error!(%guild_id, error = %e, "Failed to get unannounced birthdays");
                return None;
            }
        };

    // A bad `timezone` or `announcement_hour` also yields zero candidates, silently.
    debug!(
        %guild_id,
        month = guild_month,
        day = guild_day,
        candidates = birthday_records.len(),
        "Found unannounced birthday candidates"
    );

    if birthday_records.is_empty() {
        return None;
    }

    Some(build_celebrants(ctx, db, redis, guild_id, username_tx, birthday_records).await)
}

/// Announces the celebrants, then grants roles and writes the log rows.
async fn announce_celebrants(
    db: &PgPool,
    ctx: &Context,
    birthday_cfg: &BirthdayConfig,
    guild_id: GuildId,
    channel_id: ChannelId,
    guild_year: i32,
    celebrants: Vec<BirthdayMember>,
) {
    let sent_msg_id = match announcements::send_birthday_message(
        ctx,
        channel_id,
        &celebrants,
        birthday_cfg,
        guild_id,
    )
    .await
    {
        Ok(m) => Some(m.id),
        Err(e) => {
            // The log rows are still written with a null `sent_msg_id`, so these celebrants are
            // marked announced for the year even though nobody saw the message.
            error!(
                error = ?e,
                error_chain = %format!("{e:#}"),
                %guild_id,
                %channel_id,
                celebrants = celebrants.len(),
                "Failed to send the birthday announcement, but the year is still marked \
                 announced for every celebrant"
            );
            None
        }
    };

    info!(
        %guild_id,
        %channel_id,
        celebrants = celebrants.len(),
        sent_msg_id = ?sent_msg_id,
        "Finished birthday announcement processing; a null sent_msg_id means the send failed and \
         the celebrants are now marked announced for the year anyway"
    );

    let payload = BirthdayAnnouncement {
        guild_id,
        channel_id,
        sent_msg_id,
        celebrants: &celebrants,
        current_year: guild_year,
    };

    announcements::process_celebrant_roles(db, ctx, birthday_cfg, payload).await;
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

            if let Err(e) = ctx
                .http
                .remove_member_role(guild_id, user_id, role_id, Some("Birthday role expired"))
                .await
            {
                error!(
                    error = ?e,
                    %guild_id,
                    %user_id,
                    "Failed to remove expired birthday role; member keeps the role"
                );
            }
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
    let worker_id = format!("worker-{}", Utc::now().timestamp_millis());

    tokio::spawn(run_birthday_worker(
        pool,
        redis_client,
        guild_configs,
        username_tx,
        ctx,
        worker_id,
    ));
}

/// The worker loop. Runs under a span so a panic carries the worker id.
#[instrument(name = "birthday_worker", skip_all, fields(worker_id = %worker_id))]
async fn run_birthday_worker(
    pool: PgPool,
    redis_client: Client,
    guild_configs: Cache<GuildId, GuildSettings>,
    username_tx: mpsc::Sender<UserUpdate>,
    ctx: Context,
    worker_id: String,
) {
    let lock_key = "lock:birthday_worker";
    let lock_value = &worker_id;

    info!(worker_id = %lock_value, "Starting birthday worker task");

    loop {
        tokio::time::sleep(Duration::from_mins(2)).await;

        trace!("Attempting to acquire lock for birthday tasks");

        match crate::shared::locking::acquire_lock(&redis_client, lock_key, lock_value, 3).await {
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
}
