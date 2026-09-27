use crate::features::media_only::types::MediaOnlyChannel;
use crate::shared::task;
use anyhow::Context as _;
use serenity::all::{Context, CreateMessage, Mentionable, Message};
use std::fmt::Write;
use std::sync::Arc;
use std::time::Duration;
use tokio::time;
use tracing::warn;

pub async fn handle_violation(
    ctx: &Context,
    message: &Message,
    config: &MediaOnlyChannel,
) -> anyhow::Result<()> {
    let original_content = message.content.as_str();

    let _ = message
        .delete(ctx)
        .await
        .inspect_err(|e| warn!(error = ?e, "message not deleted; it may already be gone"));

    send_dm_for_content(ctx, message, original_content).await;

    // if delete_warning_after_secs is somehow negative
    let del_warning = u64::try_from(config.delete_warning_after_secs)
        .context("delete_warning_after_secs is negative, so it has no u64 duration")?;
    send_warning(ctx, message, del_warning).await?;

    Ok(())
}

async fn send_dm_for_content(ctx: &Context, message: &Message, original_content: &str) {
    let truncated_content = if original_content.chars().count() > 1800 {
        format!(
            "{}...",
            original_content.chars().take(1800).collect::<String>()
        )
    } else {
        original_content.to_string()
    };

    let mut original_dm_content = format!(
        "Your message has been deleted in {} as that is a media-only channel.\n",
        message.channel_id.mention(),
    );

    if !original_content.is_empty() {
        let _ = writeln!(
            original_dm_content,
            "Original content:\n```\n{truncated_content}```"
        );
    }

    let _ = message
        .author
        .dm(ctx, CreateMessage::new().content(original_dm_content))
        .await
        .inspect_err(|e| warn!(error = ?e, "message content DM not sent to the user"));
}

async fn send_warning(ctx: &Context, message: &Message, del_warning: u64) -> anyhow::Result<()> {
    let http_clone = Arc::clone(&ctx.http);

    if del_warning > 0 {
        let sent_message = message
            .channel_id
            .send_message(
                ctx,
                CreateMessage::new().content(format!(
                    "{}, Your message has been deleted as this is a media-only channel.",
                    message.author.mention()
                )),
            )
            .await?;

        task::spawn("media_only_warning_cleanup", async move {
            time::sleep(Duration::from_secs(del_warning)).await;
            let _ = sent_message.delete(http_clone).await.inspect_err(
                |e| warn!(error = ?e, "warning message not deleted; it may already be gone"),
            );
        });
    }
    Ok(())
}
