use poise::serenity_prelude as serenity;
use std::sync::Arc;

fn is_unknown_ban_error(err: &serenity::Error) -> bool {
    if let serenity::Error::Http(http_err) = err {
        if let serenity::HttpError::UnsuccessfulRequest(resp) = http_err {
            // Discord API error code 10026 represents "Unknown Ban"
            return resp.error.code == 10026;
        }
    }
    false
}

pub fn start_temp_ban_worker(db_pool: sqlx::PgPool, http: Arc<serenity::Http>) {
    tokio::spawn(async move {
        loop {
            // Check for expired bans every 60 seconds
            tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;

            let now = chrono::Utc::now();

            // Execute the isolated, transaction-locked unban job
            if let Err(e) = process_expired_temp_bans(&db_pool, &http, now).await {
                eprintln!("Error processing expired temp bans: {:?}", e);
            }
        }
    });
}

/// Helper function to fetch and process expired temp bans concurrently.
/// Uses FOR UPDATE SKIP LOCKED to ensure multiple bot instances safely coordinate tasks.
async fn process_expired_temp_bans(
    db_pool: &sqlx::PgPool,
    http: &serenity::Http,
    now: chrono::DateTime<chrono::Utc>,
) -> Result<(), sqlx::Error> {
    let mut tx = db_pool.begin().await?;

    // Fetch and lock expired bans, skipping any that are currently being processed by another node
    let expired_bans = sqlx::query!(
        r#"
        SELECT id, guild_id, user_id FROM temp_bans
        WHERE unban_at <= $1
        FOR UPDATE SKIP LOCKED
        "#,
        now
    )
    .fetch_all(&mut *tx)
    .await?;

    if expired_bans.is_empty() {
        return Ok(());
    }

    for record in expired_bans {
        let guild_id = serenity::GuildId::new(record.guild_id as u64);
        let user_id = serenity::UserId::new(record.user_id as u64);

        // Attempt to unban the user
        match guild_id.unban(http, user_id).await {
            Ok(_) => {
                // Successfully unbanned; queue record deletion inside the transaction
                sqlx::query!("DELETE FROM temp_bans WHERE id = $1", record.id)
                    .execute(&mut *tx)
                    .await?;
            }
            Err(e) => {
                if is_unknown_ban_error(&e) {
                    // The user was already unbanned manually. Clean up the database record.
                    sqlx::query!("DELETE FROM temp_bans WHERE id = $1", record.id)
                        .execute(&mut *tx)
                        .await?;
                } else {
                    // Log other errors (e.g., Missing Permissions) so they can be addressed
                    eprintln!(
                        "Failed to unban user {} in guild {}: {:?}",
                        record.user_id, record.guild_id, e
                    );
                }
            }
        }
    }

    // Commit all successful deletions at once
    tx.commit().await?;
    Ok(())
}
