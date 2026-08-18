use crate::core::config::state::BotData;
use crate::features::media_only::cache::get_channel_media;
use crate::features::media_only::types::MediaOnlyChannel;
use crate::features::media_only::violation;
use crate::shared::messages::remove_urls;
use anyhow::Result;
use serenity::all::{ChannelId, Context, CreateThread, Message, PartialMember, RoleId};
use tracing::trace;

fn has_matching_role(member: &Box<PartialMember>, roles: &[RoleId]) -> bool {
    member.roles.iter().any(|role_id| roles.contains(role_id))
}

/// Enforces media-only rules on a message, handling violations and optional auto-threads.
pub async fn handle_media_channel_message(
    ctx: &Context,
    message: &Message,
    data: &BotData,
) -> Result<()> {
    let channel_id = message.channel_id;

    // Checks exempt roles and disabled channel, and check if config exists
    let Some(config) = preflight_checks(message, channel_id, data).await? else {
        return Ok(());
    };

    let (text, urls) = remove_urls(&message.content);

    if analyze_initial_text(message, &config, text, urls) {
        violation::handle_violation(ctx, message, &config).await?;
        return Ok(());
    }

    for attachment in &message.attachments {
        let Some(mime) = attachment.content_type.as_deref() else {
            trace!("Attachment missing content type.");
            violation::handle_violation(ctx, message, &config).await?;
            return Ok(());
        };

        let is_valid = attachment_is_valid(&config, mime);

        if !is_valid {
            trace!("Attachment with mime '{mime}' is not allowed.");
            violation::handle_violation(ctx, message, &config).await?;
            return Ok(());
        }
    }

    trace!("Processing valid media-only channel message");

    if let Some(thread_name_template) = config.thread_name_template {
        if !config.auto_thread {
            return Ok(());
        }

        let thread_name = thread_name_template
            .replace("{user}", message.author.name.as_str())
            .replace(
                "{timestamp}",
                message.timestamp.to_rfc3339().unwrap_or_default().as_str(),
            );

        let builder = CreateThread::new(thread_name);

        ctx.http
            .create_thread_from_message(message.channel_id, message.id, &builder, None)
            .await?;
    }

    Ok(())
}

async fn preflight_checks(
    message: &Message,
    channel_id: ChannelId,
    data: &BotData,
) -> Result<Option<MediaOnlyChannel>> {
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
    if mime.starts_with("image/gif") {
        config.allow_gif
    } else if mime.starts_with("image/") {
        config.allow_images
    } else if mime.starts_with("video/") {
        config.allow_videos
    } else if mime.starts_with("audio/") {
        config.allow_audio
    } else {
        false // Unknown/unsupported MIME type
    }
}

fn analyze_initial_text(
    message: &Message,
    config: &MediaOnlyChannel,
    text: String,
    urls: Vec<&str>,
) -> bool {
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
