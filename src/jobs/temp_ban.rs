use crate::utils::locking::{acquire_lock, release_lock};
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
    redis_client: redis::Client
) {
    tokio::spawn(async move {
        let lock_key = "lock:temp_ban_worker";
        let lock_value = format!("worker-{}", chrono::Utc::now().timestamp_millis());

        loop {
            // Check for expired bans every 60 seconds
            tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;

            let now = chrono::Utc::now();

            // Attempt to acquire a lock for 50 seconds
            match acquire_lock(&redis_client, lock_key, &lock_value, 50).await {
                Ok(true) => {
                    if let Err(e) = process_expired_temp_bans(&db_pool, &http, now).await {
                        eprintln!("Error processing expired temp bans: {:?}", e);
                    }
                    let _ = release_lock(&redis_client, lock_key, &lock_value).await;
                }
                Ok(false) => {
                    // Another instance is currently executing this loop cycle
                }
                Err(e) => {
                    eprintln!("Failed to coordinate Redis lock for temp bans: {:?}", e);
                }
            }
        }
    });
}

/// Fetch and process expired temp bans.
async fn process_expired_temp_bans(
    db_pool: &sqlx::PgPool,
    http: &serenity::Http,
    now: chrono::DateTime<chrono::Utc>,
) -> Result<(), sqlx::Error> {
    // Fetch candidates safely without row locking
    let expired_bans = sqlx::query!(
        r#"
        SELECT id, guild_id, user_id FROM temp_bans
        WHERE unban_at <= $1
        LIMIT 50
        "#,
        now
    )
        .fetch_all(db_pool)
        .await?;

    if expired_bans.is_empty() {
        return Ok(());
    }

    // Process unbans sequentially. No active database transaction is held open during
    // these network API calls.
    for record in expired_bans {
        let guild_id = serenity::GuildId::new(record.guild_id as u64);
        let user_id = serenity::UserId::new(record.user_id as u64);

        match guild_id.unban(http, user_id).await {
            Ok(_) => {
                // Unban succeeded; delete the database entry safely in a single-row write
                sqlx::query!("DELETE FROM temp_bans WHERE id = $1", record.id)
                    .execute(db_pool)
                    .await?;
            }
            Err(e) => {
                if is_unknown_ban_error(&e) {
                    // User was manually unbanned; clean up database record
                    sqlx::query!("DELETE FROM temp_bans WHERE id = $1", record.id)
                        .execute(db_pool)
                        .await?;
                } else {
                    eprintln!(
                        "Failed to unban user {} in guild {}: {:?}",
                        record.user_id, record.guild_id, e
                    );
                }
            }
        }
    }

    Ok(())
}