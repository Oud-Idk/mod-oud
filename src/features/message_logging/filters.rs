use crate::features::message_logging::types::MessageLoggingConfig;
use crate::features::message_logging::types::{EditDetails, MessageDetails};
use crate::shared::permissions::HasRoles;
use serenity::all::{Cache, ChannelId, Context, GuildId, MessageId, UserId};
use tracing::{debug, trace, warn};

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
        && ignored_channels.contains(&channel_id)
    {
        debug!(%channel_id, "Message excluded: channel is ignored");
        return true;
    }

    // Check if user is ignored
    if let Some(ref ignored_users) = config.ignored_users
        && ignored_users.contains(&author_id)
    {
        debug!(%author_id, "Message excluded: user is ignored");
        return true;
    }

    // Check if user has any ignored roles
    // Check if user has any ignored roles
    if let Some(ref ignored_roles) = config.ignored_roles
        && !ignored_roles.is_empty()
    {
        // Look up member from the cached Guild
        let cached_has_role = ctx.cache.guild(guild_id).and_then(|guild| {
            guild
                .members
                .get(&author_id)
                .map(|m| m.has_any_role(ignored_roles))
        });

        match cached_has_role {
            Some(true) => {
                debug!(%author_id, "Message excluded: user has ignored role (from cache)");
                return true;
            }
            Some(false) => {
                // ignore
            }
            None => {
                trace!(
                    %author_id,
                    %guild_id,
                    "Member not in cache, falling back to HTTP request"
                );

                match ctx.http.get_member(guild_id, author_id).await {
                    Ok(member) => {
                        if member.has_any_role(ignored_roles) {
                            debug!(%author_id, "Message excluded: user has ignored role (from HTTP)");
                            return true;
                        }
                    }
                    Err(err) => {
                        warn!(
                            error = ?err,
                            %author_id,
                            %guild_id,
                            "Failed to fetch guild member metadata via HTTP for exclusion checks"
                        );
                    }
                }
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

    let Some(message) = cache.message(channel_id, message_id) else {
        debug!(
            chan_id = channel_id.get(),
            msg_id = message_id.get(),
            "Message not found in cache"
        );
        return None;
    };

    if message.author.bot {
        trace!(
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
    if attachment
        .content_type
        .as_deref()
        .is_some_and(|ct| ct.starts_with("image/"))
    {
        return true;
    }

    std::path::Path::new(&attachment.filename)
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| {
            matches!(
                ext.to_ascii_lowercase().as_str(),
                "png" | "jpg" | "jpeg" | "webp" | "gif"
            )
        })
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
        && old.author.bot
    {
        debug!(%msg_id, "Edit ignored: author is a bot (from cache)");
        return None;
    }

    // Fallback to old message details if event author metadata is incomplete
    let author = event
        .author
        .as_ref()
        .map(|u| (u.id, &u.name))
        .or_else(|| old_if_available.map(|m| (m.author.id, &m.author.name)));

    let Some((author_id, author_name)) = author else {
        warn!(%msg_id, "Unable to resolve author for edit event");
        return None;
    };
    let author_name = author_name.clone();

    let old_text = old_if_available.map(|m| m.content.as_str());
    let new_text = event
        .content
        .as_deref()
        .or_else(|| new.map(|m| m.content.as_str()));

    // Cheap reference comparison! Zero allocations!
    if old_text == new_text {
        debug!(%msg_id, "Edit ignored: content was unmodified");
        return None;
    }

    // Only clone once we know we actually need them
    let old_content = old_text.map(ToOwned::to_owned);
    let new_content = new_text.map(ToOwned::to_owned);

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
