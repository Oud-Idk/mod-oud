use crate::commands::helpers::show_history;
use crate::commands::messages::database::{PartialDeletedMessage, PartialEditedMessage};
use serenity::all::User;

/// Formats a single edit record into blockquoted Discord markdown.
pub fn format_edit_record(
    old_content: Option<&str>,
    new_content: Option<&str>,
    timestamp: Option<i64>,
    channel_id: u64,
) -> String {
    let formatted_time = timestamp
        .map(|ts| format!("<t:{0}:f> (<t:{0}:R>)", ts))
        .unwrap_or_else(|| "Unknown Time".to_string());

    let channel_mention = format!("<#{}>", channel_id);
    let mut entry = format!("**Channel:** {} • **Time:** {}\n", channel_mention, formatted_time);

    match old_content {
        Some(content) if !content.is_empty() => {
            let blockquoted = content.replace('\n', "\n> ");
            entry.push_str(&format!("> **Before:** {}\n", blockquoted));
        }
        _ => entry.push_str("> **Before:** *No text content or not cached*\n"),
    }

    match new_content {
        Some(content) if !content.is_empty() => {
            let blockquoted = content.replace('\n', "\n> ");
            entry.push_str(&format!("> **After:** {}\n", blockquoted));
        }
        _ => entry.push_str("> **After:** *No text content*\n"),
    }

    entry
}

pub fn build_deleted_history_response(records: &[PartialDeletedMessage], user: User, show_attachments: bool) -> String {
    let mut response = format!("# Deleted Message History for {}\n\n", user.name);

    for record in records {
        let timestamp = record.deleted_at.map(|t| t.timestamp());
        let formatted_entry = show_history::format_record(
            &record.content,
            timestamp,
            record.channel_id,
            record.attachment_url.as_deref(),
            show_attachments,
        );

        response.push_str(&formatted_entry);
        response.push('\n');
    }

    if response.len() > 2000 {
        response.truncate(1997);
        response.push_str("...");
    }

    response
}

pub fn build_edited_history_response(records: &[PartialEditedMessage], user: User) -> String {
    let mut response = format!("# Edited Message History for {}\n\n", user.name);

    for record in records {
        let timestamp = record.edited_at.map(|t| t.timestamp());
        let entry = format_edit_record(
            record.old_content.as_deref(),
            record.new_content.as_deref(),
            timestamp,
            record.channel_id as u64,
        );

        response.push_str(&entry);
        response.push('\n');
    }

    if response.len() > 2000 {
        response.truncate(1997);
        response.push_str("...");
    }

    response
}