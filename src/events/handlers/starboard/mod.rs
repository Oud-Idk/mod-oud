use crate::types::Error;
use serenity::all::{ChannelId, Context, MessageId};
use sqlx::PgPool;

pub mod starboard;
pub mod utils;
pub mod database;
pub mod permissions;

pub async fn handle_cleanup_if_starboard(
    ctx: &Context,
    db: &PgPool,
    orig_msg_id: &MessageId,
) -> Result<(), Error> {
    let id = orig_msg_id.get().to_string();

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

    for row in rows {
        let channel_id = match row.starboard_channel_id.parse::<u64>() {
            Ok(cid) => ChannelId::new(cid),
            Err(_) => continue,
        };

        if let Some(msg_id_val) = row.starboard_message_id.and_then(|id| id.parse::<u64>().ok()) {
            let msg_id = MessageId::new(msg_id_val);
            let _ = channel_id.delete_message(&ctx.http, msg_id).await;
        }
    }

    sqlx::query!(
        r#"
        DELETE FROM starred_messages
        WHERE original_message_id = $1
        "#,
        id
    )
        .execute(db)
        .await?;

    Ok(())
}