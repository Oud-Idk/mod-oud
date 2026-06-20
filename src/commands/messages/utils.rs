/// Extracts image URLs from attachments and embeds
pub fn extract_image_urls(message: &serenity::all::Message) -> Vec<String> {
    let mut urls = Vec::new();

    for attachment in &message.attachments {
        let is_image = attachment.content_type
            .as_deref()
            .map_or(false, |mime| mime.starts_with("image/"))
            || attachment.dimensions().is_some();

        if is_image {
            urls.push(attachment.url.clone());
        }
    }

    for embed in &message.embeds {
        if let Some(image) = &embed.image {
            urls.push(image.url.clone());
        }
        if let Some(thumbnail) = &embed.thumbnail {
            urls.push(thumbnail.url.clone());
        }
    }

    urls
}

/// Helper to format a single deleted message record into a Markdown string.
pub fn format_record(
    content: &str,
    timestamp: Option<i64>,
    channel_id: i64,
    attachment_url: Option<&str>,
    show_attachments: bool,
) -> String {
    let mut entry = String::new();

    let formatted_time = match timestamp {
        Some(ts) => format!("<t:{ts}:f> (<t:{ts}:R>)"),
        None => "Unknown Time".to_string(),
    };

    let channel_mention = format!("<#{}>", channel_id as u64);

    // Build the header line
    entry.push_str(&format!(
        "**Channel:** {} • **Time:** {}\n",
        channel_mention, formatted_time
    ));

    // Format the content
    if content.is_empty() {
        entry.push_str("> *No text content*\n");
    } else {
        // Replace newlines with "\n> " so multiline messages stay inside the blockquote
        let blockquoted_content = content.replace('\n', "\n> ");
        entry.push_str(&format!("> {}\n", blockquoted_content));
    }

    if show_attachments {
        if let Some(url) = attachment_url {
            if !url.trim().is_empty() {
                entry.push_str(&format!("> **Attachment:** <{}>\n", url));
            }
        }
    }

    entry
}