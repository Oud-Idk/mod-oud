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
    let id = orig_msg_id.get() as i64;
    debug!("Starting starboard cleanup check for original message");

    let rows = database::fetch_starboard(db, id).await?;

    debug!(rows_found = rows.len(), "Fetched linked starboard messages");

    for row in rows {
        if row.keep_deleted_messages.unwrap_or(false) {
            debug!(
                channel_id = row.starboard_channel_id,
                "Skipping Discord message deletion because 'keep_deleted_messages' is enabled"
            );
            continue;
        }

        let channel_id = ChannelId::new(row.starboard_channel_id as u64);

        if let Some(msg_id_val) = row.starboard_message_id.and_then(|id| Some(id as u64)) {
            let msg_id = MessageId::new(msg_id_val);
            debug!(channel_id = %channel_id, msg_id = %msg_id, "Attempting to delete message from starboard channel");
            if let Err(e) = channel_id.delete_message(&ctx.http, msg_id).await {
                warn!(error = %e, channel_id = %channel_id, msg_id = %msg_id, "Could not delete message from Discord");
            }
        }
    }

    debug!("Deleting message mappings from database");
    database::delete_starboard(db, id).await?;

    info!("Cleanup successfully completed");
    Ok(())
}