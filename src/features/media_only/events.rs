use std::sync::Arc;
use std::time::Duration;
use serenity::all::{ChannelId, Context, CreateThread, Http, Mentionable, Message, PartialMember, RoleId};
use crate::Data;
use anyhow::{Context as _, Result};
use serenity::builder::CreateMessage;
use tokio::time;
use tracing::{trace, debug, warn};
use crate::features::media_only::cache::get_channel_media;
use crate::features::media_only::types::MediaOnlyChannel;
use crate::shared::messages::remove_urls;

fn has_matching_role(member: &Box<PartialMember>, roles: &[RoleId]) -> bool {
    member.roles.iter().any(|role_id| {
        roles.contains(&role_id)
    })
}

pub async fn handle_media_channel_message(ctx: &Context, message: &Message, data: &Data) -> Result<()> {
    let channel_id = message.channel_id;

    // Checks exempt roles and disabled channel, and check if config exists
    let Some(config) = preflight_checks(&message, channel_id, data).await? else {
        return Ok(());
    };

    let (text, urls) = remove_urls(&message.content);

    if analyze_initial_text(&message, &config, text, urls) {
        handle_violation(&ctx, &message, &config).await?;
        return Ok(())
    };


    for attachment in &message.attachments {
        let Some(mime) = attachment.content_type.as_deref() else {
            trace!("Attachment missing content type.");
            handle_violation(&ctx, &message, &config).await?;
            return Ok(());
        };

        let is_valid = attachment_is_valid(&config, mime);

        if !is_valid {
            trace!("Attachment with mime '{mime}' is not allowed.");
            handle_violation(&ctx, &message, &config).await?;
            return Ok(());
        }
    }

    trace!("Processing valid media-only channel message");

    if let Some(thread_name_template) = config.thread_name_template {
        if !config.auto_thread {
            return Ok(())
        }

        let thread_name = thread_name_template
            .replace("{user}", message.author.name.as_str())
            .replace("{timestamp}", message.timestamp.to_rfc3339().unwrap_or_default().as_str());

        let builder = CreateThread::new(thread_name);

        ctx.http.create_thread_from_message(message.channel_id, message.id, &builder, None).await?;
    }

    Ok(())
}

async fn preflight_checks(message: &Message, channel_id: ChannelId, data: &Data) -> Result<Option<MediaOnlyChannel>> {
    if message.author.bot {
        trace!("Author is a bot. Skipping");
        return Ok(None);
    }

    let Some(config) = get_channel_media(data, channel_id).await? else {
        trace!("Channel is not media channel. Skipping");
        return Ok(None);
    };

    if !config.enabled {
        trace!("Media-only channel is disabled. Skipping");
        return Ok(None);
    }

    let Some(member) = &message.member else {
        trace!("Message has no member. Skipping");
        return Ok(None);
    };

    if has_matching_role(member, &config.exempt_role_ids()) {
        trace!("Member has an exempt role. Skipping enforcement.");
        return Ok(None);
    }
    Ok(Some(config))
}

fn attachment_is_valid(config: &MediaOnlyChannel, mime: &str) -> bool {
    let is_valid = if mime.starts_with("image/gif") {
        config.allow_gif
    } else if mime.starts_with("image/") {
        config.allow_images
    } else if mime.starts_with("video/") {
        config.allow_videos
    } else if mime.starts_with("audio/") {
        config.allow_audio
    } else {
        false // Unknown/unsupported MIME type
    };
    is_valid
}

fn analyze_initial_text(message: &Message, config: &MediaOnlyChannel, text: String, urls: Vec<&str>) -> bool {
    if !text.is_empty() && !config.allow_embedded_text {
        trace!("Text is not allowed in this channel.");
        return true;
    }

    if !urls.is_empty() && !config.allow_links {
        trace!("Links are not allowed in this channel.");
        return true;
    }

    let has_links = !urls.is_empty() && config.allow_links;
    let has_attachments = !message.attachments.is_empty();

    if !has_attachments && !has_links {
        trace!("Message contains no media or allowed links.");
        return true;
    }

    false
}

async fn handle_violation(ctx: &Context, message: &Message, config: &MediaOnlyChannel) -> Result<()> {
    let original_content = message.content.as_str();

    let _ = message.delete(ctx).await
        .inspect_err(|e| warn!(error = ?e, "Couldn't delete message. Was it already deleted?"));

    send_dm_for_content(ctx, message, original_content).await;

    let del_warning = config.delete_warning_after_secs as u64;
    send_warning(ctx, message, del_warning).await?;

    Ok(())
}

async fn send_dm_for_content(ctx: &Context, message: &Message, original_content: &str) {
    let truncated_content = if original_content.chars().count() > 1800 {
        format!("{}...", &original_content.chars().take(1800).collect::<String>())
    } else {
        original_content.to_string()
    };

    let mut original_dm_content = format!(
        "Your message has been deleted in {} as that is a media-only channel.\n",
        message.channel_id.mention(),
    );

    if !original_content.is_empty() {
        original_dm_content.push_str(
            &format!("Original content:\n```\n{}\n```", truncated_content)
        );
    }

    let _ = message.author.dm(ctx, CreateMessage::new().content(original_dm_content)).await
        .inspect_err(|e| debug!(error = ?e, "Couldn't resend message content to user."));
}

async fn send_warning(ctx: &Context, message: &Message, del_warning: u64) -> Result<()> {
    let http_clone = Arc::clone(&ctx.http);

    if del_warning > 0 {
        let sent_message = message.channel_id.send_message(ctx,
            CreateMessage::new().content(format!(
                "{}, Your message has been deleted as this is a media-only channel.",
                message.author.mention()
            ))
        ).await?;

        tokio::spawn(async move {
            time::sleep(Duration::from_secs(del_warning)).await;
            let _ = sent_message.delete(http_clone).await
                .inspect_err(|e|
                    warn!(error = ?e, "Couldn't delete warning message. Was it already deleted?")
                );
        });
    }
    Ok(())
}