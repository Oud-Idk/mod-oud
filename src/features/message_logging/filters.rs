use crate::features::message_logging::types::MessageLoggingConfig;
use crate::features::message_logging::types::{EditDetails, MessageDetails};
use serenity::all::{Cache, ChannelId, Context, GuildId, MessageId, UserId};
use tracing::{debug, trace, warn};
use crate::shared::permissions::HasRoles;

/// Checks if a message should be excluded from logging based on channel, user, or role exclusions.
pub async fn should_exclude_from_logging(
    config: &MessageLoggingConfig,
    author_id: UserId,
    channel_id: ChannelId,
    guild_id: GuildId,
    ctx: &Context,
) -> bool {
    trace!(
        %author_id,
        %channel_id,
        %guild_id,
        "Evaluating message logging exclusions"
    );

    // Check if channel is ignored
    if let Some(ref ignored_channels) = config.ignored_channels
        && ignored_channels.contains(&channel_id) {
        debug!(%channel_id, "Message excluded: channel is ignored");
        return true;
    }

    // Check if user is ignored
    if let Some(ref ignored_users) = config.ignored_users
        && ignored_users.contains(&author_id) {
        debug!(%author_id, "Message excluded: user is ignored");
        return true;
    }

    // Check if user has any ignored roles
    if let Some(ref ignored_roles) = config.ignored_roles
        && !ignored_roles.is_empty() {
        let member_result = guild_id
            .member(ctx, author_id)
            .await;

        match member_result {
            Ok(member) => {
                if member.has_any_role(ignored_roles) {
                    debug!(
                        %author_id,
                        "Message excluded: user has ignored role"
                    );
                    return true;
                }
            }
            Err(err) => {
                warn!(
                    error = ?err,
                    %author_id,
                    %guild_id,
                    "Failed to fetch guild member metadata for exclusion checks"
                );
            }
        }
    }

    trace!(
        %author_id,
        %channel_id,
        "No matching exclusions found for message"
    );
    false
}

/// Extracts message details from the cache if the message was not authored by a bot.
pub fn fetch_cached_message(
    cache: &Cache,
    channel_id: ChannelId,
    message_id: MessageId,
) -> Option<MessageDetails> {
    trace!(
        chan_id = channel_id.get(),
        msg_id = message_id.get(),
        "Fetching message from cache"
    );

    let message = if let Some(msg) = cache.message(channel_id, message_id) { msg } else {
        trace!(
            chan_id = channel_id.get(),
            msg_id = message_id.get(),
            "Message not found in cache"
        );
        return None;
    };

    if message.author.bot {
        debug!(
            msg_id = message.id.get(),
            author_id = message.author.id.get(),
            "Cached message skipped: author is a bot"
        );
        return None;
    }

    let image_urls = message
        .attachments
        .iter()
        .filter(|a| is_image_attachment(a))
        .map(|a| a.url.clone())
        .collect();

    trace!(
        msg_id = %message.id,
        "Successfully retrieved and parsed cached message"
    );

    Some(MessageDetails {
        msg_id: message.id,
        author_id: message.author.id,
        author_name: message.author.name.clone(),
        chan_id: message.channel_id,
        content: message.content.clone(),
        image_urls,
    })
}

/// Evaluates if an attachment is an image based on its suffix or content type header.
fn is_image_attachment(attachment: &serenity::all::Attachment) -> bool {
    let result = attachment
        .content_type
        .as_ref()
        .is_some_and(|ct| ct.starts_with("image/"))
        || attachment.filename.ends_with(".png")
        || attachment.filename.ends_with(".jpg")
        || attachment.filename.ends_with(".jpeg")
        || attachment.filename.ends_with(".webp")
        || attachment.filename.ends_with(".gif");

    trace!(
        attachment_id = attachment.id.get(),
        filename = attachment.filename,
        is_image = result,
        "Evaluated attachment image status"
    );

    result
}

/// Resolves message text values and user identifiers while handling fallbacks.
/// Returns `None` if the author was a bot or if the text was not modified.
pub fn extract_edit_details(
    old_if_available: Option<&serenity::all::Message>,
    new: Option<&serenity::all::Message>,
    event: &serenity::all::MessageUpdateEvent,
) -> Option<EditDetails> {
    let msg_id = event.id;
    let chan_id = event.channel_id;

    trace!(%msg_id, %chan_id, "Processing message update event");

    // Check if the author of the update or the cached message is a bot
    if let Some(author) = &event.author {
        if author.bot {
            debug!(%msg_id, "Edit ignored: author is a bot (from event)");
            return None;
        }
    } else if let Some(old) = old_if_available
        && old.author.bot {
        debug!(%msg_id, "Edit ignored: author is a bot (from cache)");
        return None;
    }

    // Fallback to old message details if event author metadata is incomplete
    let author_id = if let Some(id) = event
        .author
        .as_ref()
        .map(|u| u.id)
        .or_else(|| old_if_available.map(|m| m.author.id)) { id } else {
        warn!(%msg_id, "Unable to resolve author ID for edit event");
        return None;
    };

    let author_name = if let Some(name) = event
        .author
        .as_ref()
        .map(|u| u.name.clone())
        .or_else(|| old_if_available.map(|m| m.author.name.clone())) { name } else {
        warn!(%msg_id, "Unable to resolve author username for edit event");
        return None;
    };

    let _avatar_url = event
        .author
        .as_ref()
        .and_then(serenity::all::User::avatar_url)
        .or_else(|| old_if_available.and_then(|m| m.author.avatar_url()));

    let old_content = old_if_available.map(|m| m.content.clone());
    let new_content = event
        .content
        .clone()
        .or_else(|| new.map(|m| m.content.clone()));

    // Skip log dispatch if the text payload hasn't changed (e.g. embed edits, link expanding)
    if old_content == new_content {
        debug!(
            %msg_id,
            "Edit ignored: content was unmodified (possibly embed or link metadata change)"
        );
        return None;
    }

    trace!(%msg_id, %author_id, "Successfully resolved edit details");

    Some(EditDetails {
        msg_id,
        chan_id,
        author_id,
        author_name,
        old_content,
        new_content,
    })
}