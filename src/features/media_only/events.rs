use crate::features::media_only::cache::get_channel_media;
use crate::features::media_only::types::MediaOnlyChannel;
use crate::features::media_only::violation;
use crate::shared::messages::remove_urls;
use crate::{core::config::state::BotData, features::media_only::types::MediaType};
use anyhow::Result;
use serenity::all::{ChannelId, Context, CreateThread, Message, PartialMember, RoleId};
use tracing::trace;

fn has_matching_role(member: &PartialMember, roles: &[RoleId]) -> bool {
    member.roles.iter().any(|role_id| roles.contains(role_id))
}

/// Enforces media-only rules on a message, handling violations and optional auto-threads.
///
/// # Errors
/// Returns an error if the media-only config cannot be loaded or the violation
/// handler fails.
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

    if analyze_initial_text(message, &config, &text, &urls) {
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
    MediaType::from_mime(mime).is_some_and(|media_type| config.allowed_media.contains(&media_type))
}

fn analyze_initial_text(
    message: &Message,
    config: &MediaOnlyChannel,
    text: &str,
    urls: &[&str],
) -> bool {
    let allow_text = config.allowed_media.contains(&MediaType::EmbeddedText);
    let allow_links = config.allowed_media.contains(&MediaType::Link);

    // Text is present but text isn't allowed
    if !text.is_empty() && !allow_text {
        trace!("Text is not allowed in this channel.");
        return true;
    }

    // Links are present but links aren't allowed
    if !urls.is_empty() && !allow_links {
        trace!("Links are not allowed in this channel.");
        return true;
    }

    // Must contain at least one valid media piece (an attachment OR an allowed link)
    let has_allowed_links = !urls.is_empty() && allow_links;
    let has_attachments = !message.attachments.is_empty();

    if !has_attachments && !has_allowed_links {
        trace!("Message contains no media or allowed links.");
        return true;
    }

    false
}
