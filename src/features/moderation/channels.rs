use anyhow::Result;
use serenity::all::{ChannelId, GuildId, Http};
use tracing::{debug, info, warn};

pub async fn delete_entire_category(
    http: impl AsRef<Http>,
    guild_id: GuildId,
    category_id: ChannelId,
) -> Result<usize> {
    let http_ref = http.as_ref();

    let channels = guild_id.channels(http_ref).await?;

    let child_channels: Vec<ChannelId> = channels
        .values()
        .filter(|channel| channel.parent_id == Some(category_id))
        .map(|channel| channel.id)
        .collect();

    info!(
        %guild_id,
        category_id = %category_id,
        count = child_channels.len(),
        "Found child channels to delete"
    );

    let mut deleted_count = 0;
    for channel_id in &child_channels {
        match channel_id.delete(http_ref).await {
            Ok(_) => {
                debug!(channel_id = %channel_id, "Deleted channel");
                deleted_count += 1;
            }
            Err(e) => {
                warn!(
                    error = ?e,
                    channel_id = %channel_id,
                    "Failed to delete child channel inside category"
                );
            }
        }
    }

    category_id.delete(http_ref).await?;

    Ok(deleted_count)
}
