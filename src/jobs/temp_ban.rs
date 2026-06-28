use crate::utils::locking::{acquire_lock, release_lock};
use fred::prelude::*;
use futures_util::StreamExt;
use poise::serenity_prelude as serenity;
use std::sync::Arc;

fn is_unknown_ban_error(err: &serenity::Error) -> bool {
    if let serenity::Error::Http(http_err) = err {
        if let serenity::HttpError::UnsuccessfulRequest(resp) = http_err {
            return resp.error.code == 10026; // 10026 represents "Unknown Ban"
        }
    }
    false
}

pub fn start_temp_ban_worker(
    db_pool: sqlx::PgPool,
    http: Arc<serenity::Http>,
    redis_client: Client,
) {
    tokio::spawn(async move {
        let lock_key = "lock:temp_ban_worker";
        let lock_value = format!("worker-{}", chrono::Utc::now().timestamp_millis());

        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;

            let now = chrono::Utc::now();

            // Pass our thread-safe &redis_client reference directly! No mutability required.
            match acquire_lock(&redis_client, lock_key, &lock_value, 50).await {
                Ok(true) => {
                    if let Err(e) = process_expired_temp_bans(&db_pool, &http, now).await {
                        eprintln!("Error processing expired temp bans: {:?}", e);
                    }
                    let _ = release_lock(&redis_client, lock_key, &lock_value).await;
                }
                Ok(false) => {}
                Err(e) => {
                    eprintln!("Failed to coordinate Redis lock for temp bans: {:?}", e);
                }
            }
        }
    });
}

/// Fetch and process expired temp bans. (Unchanged!)
async fn process_expired_temp_bans(
    db_pool: &sqlx::PgPool,
    http: &serenity::Http,
    now: chrono::DateTime<chrono::Utc>,
) -> Result<(), sqlx::Error> {
    let expired_bans = sqlx::query!(
        r#"
        SELECT id, guild_id, user_id FROM temp_bans
        WHERE unban_at <= $1
        LIMIT 200
        "#,
        now
    )
        .fetch_all(db_pool)
        .await?;

    if expired_bans.is_empty() {
        return Ok(());
    }

    let unban_futures = expired_bans.into_iter().map(|record| {
        let http_ref = http;

        async move {
            let guild_id = serenity::GuildId::new(record.guild_id as u64);
            let user_id = serenity::UserId::new(record.user_id as u64);

            match guild_id.unban(http_ref, user_id).await {
                Ok(_) => {
                    Ok(record.id)
                }
                Err(e) => {
                    if is_unknown_ban_error(&e) {
                        Ok(record.id)
                    } else {
                        eprintln!(
                            "Failed to unban user {} in guild {}: {:?}",
                            record.user_id, record.guild_id, e
                        );
                        Err(record.id)
                    }
                }
            }
        }
    });

    let results: Vec<Result<i32, i32>> = futures_util::stream::iter(unban_futures)
        .buffer_unordered(10)
        .collect()
        .await;

    let successful_ids: Vec<i32> = results
        .into_iter()
        .filter_map(|r| r.ok())
        .collect();

    if !successful_ids.is_empty() {
        sqlx::query!(
            "DELETE FROM temp_bans WHERE id = ANY($1)",
            &successful_ids
        )
            .execute(db_pool)
            .await?;
    }

    Ok(())
}