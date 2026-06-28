use crate::types::Error;
use serenity::all::{ChannelId, Context, MessageId};
use sqlx::PgPool;
use tracing::{debug, error, info, instrument, warn};

pub mod starboard;
pub mod utils;
pub mod database;
pub mod permissions;
pub mod cache;

#[instrument(skip(ctx, db), fields(orig_msg_id = orig_msg_id.get()))]
pub async fn handle_cleanup_if_starboard(
    ctx: &Context,
    db: &PgPool,
    orig_msg_id: &MessageId,
) -> Result<(), Error> {
    let id = orig_msg_id.get().to_string();
    debug!("Starting starboard cleanup check for original message");

    let rows = sqlx::query!(
        r#"
        SELECT sm.starboard_message_id, s.starboard_channel_id
        FROM starred_messages sm
        JOIN starboards s ON sm.starboard_id = s.id
        WHERE sm.original_message_id = $1
        "#,
        id
    )
        .fetch_all(db)
        .await?;

    debug!(rows_found = rows.len(), "Fetched linked starboard messages");

    for row in rows {
        let channel_id = match row.starboard_channel_id.parse::<u64>() {
            Ok(cid) => ChannelId::new(cid),
            Err(e) => {
                error!(error = %e, raw_id = ?row.starboard_channel_id, "Failed to parse starboard channel ID");
                continue;
            }
        };

        if let Some(msg_id_val) = row.starboard_message_id.and_then(|id| id.parse::<u64>().ok()) {
            let msg_id = MessageId::new(msg_id_val);
            debug!(channel_id = %channel_id, msg_id = %msg_id, "Attempting to delete message from starboard channel");
            if let Err(e) = channel_id.delete_message(&ctx.http, msg_id).await {
                warn!(error = %e, channel_id = %channel_id, msg_id = %msg_id, "Could not delete message from Discord");
            }
        }
    }

    debug!("Deleting message mappings from database");
    sqlx::query!(
        r#"
        DELETE FROM starred_messages
        WHERE original_message_id = $1
        "#,
        id
    )
        .execute(db)
        .await?;

    info!("Cleanup successfully completed");
    Ok(())
}