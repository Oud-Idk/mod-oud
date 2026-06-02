use crate::event_handlers::handlers::message_logging::{EditDetails, MessageDetails};

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

/// Generates a unified vector of embeds representing the deleted text and images.
pub fn build_delete_embeds(
    author_id: i64,
    chan_id: i64,
    content: &str,
    avatar_url: &Option<String>,
    image_urls: &[String],
) -> Vec<serenity::all::CreateEmbed> {
    let content_display = if content.is_empty() && image_urls.is_empty() {
        "*No text content or attachments*"
    } else if content.is_empty() {
        "*No text content (attachments only)*"
    } else {
        content
    };

    let mut main_embed = serenity::all::CreateEmbed::new()
        .title("Message Deleted")
        .color(0xD0021B)
        .field("Author", format!("<@{}>", author_id), true)
        .field("Channel", format!("<#{}>", chan_id), true)
        .field("Content", content_display, false);

    if let Some(url) = avatar_url {
        main_embed = main_embed.thumbnail(url);
    }

    let mut embeds = Vec::new();
    if let Some(first_url) = image_urls.first() {
        main_embed = main_embed.image(first_url);
        embeds.push(main_embed);

        // Add additional secondary embeds to attach multiple images to a single block
        for url in image_urls.iter().skip(1).take(9) {
            embeds.push(serenity::all::CreateEmbed::new().image(url));
        }
    } else {
        embeds.push(main_embed);
    }

    embeds
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

/// Constructs a Discord embed displaying the transition from the old message value to the new one.
pub fn build_edit_embed(details: &EditDetails) -> serenity::all::CreateEmbed {
    let mut embed = serenity::all::CreateEmbed::new()
        .title("Message Edited")
        .color(0xF5A623)
        .field("Author", format!("<@{}>", details.author_id), true)
        .field("Channel", format!("<#{}>", details.chan_id), true)
        .field(
            "Original Content",
            details.old_content.as_deref().unwrap_or("*Unknown (not in cache)*"),
            false,
        )
        .field(
            "New Content",
            details.new_content.as_deref().unwrap_or("*No text content*"),
            false,
        );

    if let Some(ref url) = details.avatar_url {
        embed = embed.thumbnail(url);
    }

    embed
}