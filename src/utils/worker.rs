use std::sync::Arc;
use poise::serenity_prelude as serenity;

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

            // Using OffsetDateTime here as an example (adjust if you chose Chrono)
            let now = chrono::Utc::now();

            let expired_bans = match sqlx::query!(
                "SELECT id, guild_id, user_id FROM temp_bans WHERE unban_at <= $1",
                now
            )
            .fetch_all(&db_pool)
            .await 
            {
                Ok(rows) => rows,
                Err(e) => {
                    eprintln!("Failed to fetch expired temp bans: {:?}", e);
                    continue;
                }
            };

            for record in expired_bans {
                let guild_id = serenity::GuildId::new(record.guild_id as u64);
                let user_id = serenity::UserId::new(record.user_id as u64);

                // Attempt to unban the user
                match guild_id.unban(&http, user_id).await {
                    Ok(_) => {
                        // Successfully unbanned
                        let _ = sqlx::query!("DELETE FROM temp_bans WHERE id = $1", record.id)
                            .execute(&db_pool)
                            .await;
                    }
                    Err(e) => {
                        if is_unknown_ban_error(&e) {
                            // The user was already unbanned manually. Clean up the database record.
                            let _ = sqlx::query!("DELETE FROM temp_bans WHERE id = $1", record.id)
                                .execute(&db_pool)
                                .await;
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
        }
    });
}