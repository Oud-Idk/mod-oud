use crate::events::handlers::message_logging::{EditDetails, MessageDetails};
use crate::types::config::message_logging::MessageLoggingConfig;
use serenity::all::GuildId;

/// Checks if a message should be excluded from logging based on channel, user, or role exclusions.
pub async fn should_exclude_from_logging(
    config: &MessageLoggingConfig,
    author_id: i64,
    channel_id: i64,
    guild_id: i64,
    ctx: &serenity::all::Context,
) -> bool {
    // Check if channel is ignored
    if let Some(ref ignored_channels) = config.ignored_channels {
        if ignored_channels.contains(&channel_id.to_string()) {
            return true;
        }
    }

    // Check if user is ignored
    if let Some(ref ignored_users) = config.ignored_users {
        if ignored_users.contains(&author_id.to_string()) {
            return true;
        }
    }

    // Check if user has any ignored roles
    if let Some(ref ignored_roles) = config.ignored_roles {
        if !ignored_roles.is_empty() {
            if let Ok(member) = GuildId::new(guild_id as u64)
                .member(ctx, serenity::all::UserId::new(author_id as u64))
                .await
            {
                for role_id in &member.roles {
                    if ignored_roles.contains(&role_id.get().to_string()) {
                        return true;
                    }
                }
            }
        }
    }

    false
}

/// Extracts message details from the cache if the message was not authored by a bot.
pub fn fetch_cached_message(
    cache: &serenity::all::Cache,
    channel_id: &serenity::all::ChannelId,
    message_id: &serenity::all::MessageId,
) -> Option<MessageDetails> {
    let message = cache.message(channel_id, message_id)?;
    if message.author.bot {
        return None;
    }

    let image_urls = message
        .attachments
        .iter()
        .filter(|a| is_image_attachment(a))
        .map(|a| a.url.clone())
        .collect();

    Some(MessageDetails {
        msg_id: message.id.get() as i64,
        author_id: message.author.id.get() as i64,
        author_name: message.author.name.clone(),
        avatar_url: message.author.avatar_url(),
        chan_id: message.channel_id.get() as i64,
        content: message.content.clone(),
        image_urls,
    })
}

/// Evaluates if an attachment is an image based on its suffix or content type header.
fn is_image_attachment(attachment: &serenity::all::Attachment) -> bool {
    attachment
        .content_type
        .as_ref()
        .map_or(false, |ct| ct.starts_with("image/"))
        || attachment.filename.ends_with(".png")
        || attachment.filename.ends_with(".jpg")
        || attachment.filename.ends_with(".jpeg")
        || attachment.filename.ends_with(".webp")
        || attachment.filename.ends_with(".gif")
}


/// Resolves message text values and user identifiers while handling fallbacks.
/// Returns `None` if the author was a bot or if the text was not modified.
pub fn extract_edit_details(
    old_if_available: Option<&serenity::all::Message>,
    new: Option<&serenity::all::Message>,
    event: &serenity::all::MessageUpdateEvent,
) -> Option<EditDetails> {
    // Check if the author of the update or the cached message is a bot
    if let Some(author) = &event.author {
        if author.bot {
            return None;
        }
    } else if let Some(old) = old_if_available {
        if old.author.bot {
            return None;
        }
    }

    let msg_id = event.id.get() as i64;
    let chan_id = event.channel_id.get() as i64;

    // Fallback to old message details if event author metadata is incomplete
    let author_id = event
        .author
        .as_ref()
        .map(|u| u.id.get() as i64)
        .or_else(|| old_if_available.map(|m| m.author.id.get() as i64))?;

    let author_name = event
        .author
        .as_ref()
        .map(|u| u.name.clone())
        .or_else(|| old_if_available.map(|m| m.author.name.clone()))?;

    let avatar_url = event
        .author
        .as_ref()
        .and_then(|u| u.avatar_url())
        .or_else(|| old_if_available.and_then(|m| m.author.avatar_url()));

    let old_content = old_if_available.map(|m| m.content.clone());
    let new_content = event
        .content
        .clone()
        .or_else(|| new.map(|m| m.content.clone()));

    // Skip log dispatch if the text payload hasn't changed (e.g. embed edits, link expanding)
    if old_content == new_content {
        return None;
    }

    Some(EditDetails {
        msg_id,
        chan_id,
        author_id,
        author_name,
        avatar_url,
        old_content,
        new_content,
    })
}