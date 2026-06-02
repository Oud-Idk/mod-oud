use serenity::model::user::User;

use crate::{Context, Error};
use crate::commands::helpers::show_history;

/// Get the history of deleted messages by a user
#[poise::command(
    slash_command,
    default_member_permissions = "BAN_MEMBERS",
    guild_only,
)]
pub async fn deleted_history(
    ctx: Context<'_>,

    #[description = "The user to fetch deleted messages of"]
    user: User,

    #[description = "The number of messages (default 10)"]
    messages: Option<i64>,

    #[description = "Show attachment URLs"]
    show_attachment_urls: Option<bool>,

    #[description = "Whether to show this as ephemeral. Normally true."]
    ephemeral: Option<bool>,
) -> Result<(), Error> {
    let db_pool = &ctx.data().db;
    let target_uid = user.id.get() as i64;
    let limit = messages.unwrap_or(10);
    let show_attachments = show_attachment_urls.unwrap_or(false);
    let is_ephemeral = ephemeral.unwrap_or(true);

    let records = sqlx::query!(
        r#"
        SELECT content, deleted_at, channel_id, attachment_url FROM deleted_messages
        WHERE author_id = $1 ORDER BY deleted_at DESC LIMIT $2
        "#,
        target_uid, limit,
    )
        .fetch_all(db_pool)
        .await?;

    if records.is_empty() {
        ctx.send(
            poise::CreateReply::default()
                .content(format!("No deleted messages found for {}.", user.name))
                .ephemeral(is_ephemeral)
        ).await?;
        return Ok(());
    }

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

    // Ensure we do not exceed Discord's message limit (2000 characters)
    if response.len() > 2000 {
        response.truncate(1997);
        response.push_str("...");
    }

    ctx.send(
        poise::CreateReply::default()
            .content(response)
            .ephemeral(is_ephemeral)
    ).await?;

    Ok(())
}

/// Get the history of edited messages by a user
#[poise::command(
    slash_command,
    default_member_permissions = "BAN_MEMBERS",
    guild_only,
)]
pub async fn edit_history(
    ctx: Context<'_>,

    #[description = "The user to fetch edited messages of"]
    user: User,

    #[description = "The number of messages (default 10)"]
    messages: Option<i64>,

    #[description = "Whether to show this as ephemeral. Normally true."]
    ephemeral: Option<bool>,
) -> Result<(), Error> {
    let db_pool = &ctx.data().db;
    let target_uid = user.id.get() as i64;
    let limit = messages.unwrap_or(10);

    let records = sqlx::query!(
        r#"
        SELECT old_content, new_content, edited_at, channel_id 
        FROM modified_messages 
        WHERE author_id = $1 ORDER BY edited_at DESC LIMIT $2
        "#,
        target_uid, limit,
    )
        .fetch_all(db_pool)
        .await?;

    if records.is_empty() {
        ctx.send(
            poise::CreateReply::default()
                .content(format!("No edited messages found for {}.", user.name))
                .ephemeral(ephemeral.unwrap_or(true))
        ).await?;
        return Ok(());
    }

    let mut response = format!("# Edited Message History for {}\n\n", user.name);
    
    for record in records {
        // Format the timestamp using Discord's relative/absolute time markdown
        let formatted_time = record.edited_at
            .map(|t| {
                let ts = t.timestamp();
                format!("<t:{0}:f> (<t:{0}:R>)", ts)
            })
            .unwrap_or_else(|| "Unknown Time".to_string());

        let channel_mention = format!("<#{}>", record.channel_id as u64);

        // Build the header line for this record
        response.push_str(&format!("**Channel:** {} • **Time:** {}\n", channel_mention, formatted_time));

        // Format old content (Before)
        match &record.old_content {
            Some(content) if !content.is_empty() => {
                let blockquoted_old = content.replace('\n', "\n> ");
                response.push_str(&format!("> **Before:** {}\n", blockquoted_old));
            }
            _ => {
                response.push_str("> **Before:** *No text content or not cached*\n");
            }
        }

        // Format new content (After)
        match &record.new_content {
            Some(content) if !content.is_empty() => {
                let blockquoted_new = content.replace('\n', "\n> ");
                response.push_str(&format!("> **After:** {}\n", blockquoted_new));
            }
            _ => {
                response.push_str("> **After:** *No text content*\n");
            }
        }
        
        // Add a blank line between messages
        response.push('\n');
    }

    // Ensure we do not exceed Discord's message limit (2000 characters)
    if response.len() > 2000 {
        response.truncate(1997);
        response.push_str("...");
    }

    ctx.send(
        poise::CreateReply::default()
            .content(response)
            .ephemeral(ephemeral.unwrap_or(true))
    ).await?;

    Ok(())
}