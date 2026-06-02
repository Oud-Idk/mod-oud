/// Helper to format a single deleted message record into a markdown string.
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
    entry.push_str(&format!("**Channel:** {} • **Time:** {}\n", channel_mention, formatted_time));

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