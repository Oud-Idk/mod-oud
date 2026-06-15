use crate::commands::helpers::show_history;
use crate::core::config::get_settings;
use crate::types::types::{Context, Error, ReportedMessagePayload};
use poise::{serenity_prelude as serenity, Modal};
use redis::AsyncCommands;
use serenity::model::user::User;

/// Get the history of deleted messages by a user
#[poise::command(slash_command, default_member_permissions = "BAN_MEMBERS", guild_only)]
pub async fn deleted_history(
    ctx: Context<'_>,

    #[description = "The user to fetch deleted messages of"] user: User,

    #[description = "The number of messages (default 10)"] messages: Option<i64>,

    #[description = "Show attachment URLs"] show_attachment_urls: Option<bool>,

    #[description = "Whether to show this as ephemeral. Normally true."] ephemeral: Option<bool>,
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
        target_uid,
        limit,
    )
        .fetch_all(db_pool)
        .await?;

    if records.is_empty() {
        ctx.send(
            poise::CreateReply::default()
                .content(format!("No deleted messages found for {}.", user.name))
                .ephemeral(is_ephemeral),
        )
            .await?;
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
            .ephemeral(is_ephemeral),
    )
        .await?;

    Ok(())
}

/// Get the history of edited messages by a user
#[poise::command(slash_command, default_member_permissions = "BAN_MEMBERS", guild_only)]
pub async fn edit_history(
    ctx: Context<'_>,

    #[description = "The user to fetch edited messages of"] user: User,

    #[description = "The number of messages (default 10)"] messages: Option<i64>,

    #[description = "Whether to show this as ephemeral. Normally true."] ephemeral: Option<bool>,
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
        target_uid,
        limit,
    )
        .fetch_all(db_pool)
        .await?;

    if records.is_empty() {
        ctx.send(
            poise::CreateReply::default()
                .content(format!("No edited messages found for {}.", user.name))
                .ephemeral(ephemeral.unwrap_or(true)),
        )
            .await?;
        return Ok(());
    }

    let mut response = format!("# Edited Message History for {}\n\n", user.name);

    for record in records {
        // Format the timestamp using Discord's relative/absolute time markdown
        let formatted_time = record
            .edited_at
            .map(|t| {
                let ts = t.timestamp();
                format!("<t:{0}:f> (<t:{0}:R>)", ts)
            })
            .unwrap_or_else(|| "Unknown Time".to_string());

        let channel_mention = format!("<#{}>", record.channel_id as u64);

        // Build the header line for this record
        response.push_str(&format!(
            "**Channel:** {} • **Time:** {}\n",
            channel_mention, formatted_time
        ));

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
            .ephemeral(ephemeral.unwrap_or(true)),
    )
        .await?;

    Ok(())
}

pub fn extract_image_urls(message: &serenity::Message) -> Vec<String> {
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

    // 2. Rich Embeds (link previews, webhooks, GIFs)
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

#[derive(poise::Modal)]
#[name = "Report This Message"] // The title of the popup window
struct ReportModal {
    #[placeholder = "Please explain why you are reporting this message..."]
    #[paragraph]
    reason: String,
}

#[poise::command(context_menu_command = "Report This Message", guild_only)]
pub async fn report_message(
    ctx: Context<'_>,
    message: serenity::Message,
) -> Result<(), Error> {
    let app_ctx = match ctx {
        Context::Application(x) => x,
        _ => return Ok(()),
    };

    let db = &ctx.data().db;
    let redis = ctx.data().redis.clone();
    let guild_id = ctx.guild_id().unwrap().get();

    let config = get_settings(db, &redis, guild_id as i64).await?;
    let Some(report_config) = config.report else {
        println!("Report is not available");
        ctx.send(
            poise::CreateReply::default()
                .content("Reporting isn't enabled in this guild.")
                .ephemeral(true)
        ).await?;

        return Ok(());
    };
    if report_config.enabled == false {
        ctx.send(
            poise::CreateReply::default()
                .content("Reporting isn't enabled in this guild.")
                .ephemeral(true)
        ).await?;

        return Ok(());
    }

    let modal_data = ReportModal::execute(app_ctx).await?;

    if let Some(modal) = modal_data {
        let reporter = ctx.author();
        let author = &message.author;
        let reason = modal.reason;

        // 3. Extract the metadata we designed for the Postgres database
        let message_id = message.id.to_string();
        let channel_id = message.channel_id.to_string();
        let guild_id_str = guild_id.to_string();
        let author_id = author.id.to_string();
        let reporter_id = reporter.id.to_string();
        let message_content = message.content.clone();
        let joined_image_urls = extract_image_urls(&message).join(",");

        let author_name = author.name.clone();
        let reporter_name = reporter.name.clone();

        // 4. Save to your Postgres DB!
        let db = &ctx.data().db;

        let row = sqlx::query!(
            r#"
            INSERT INTO reported_messages (guild_id, channel_id, message_id, author_id, reporter_id, message_content, attachment_url, reason, author_name, reporter_name)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (message_id, reporter_id) DO NOTHING
            RETURNING id
            "#,
            guild_id_str,
            channel_id,
            message_id,
            author_id,
            reporter_id,
            message_content,
            joined_image_urls,
            reason,
            author_name,
            reporter_name,
        )
            .fetch_optional(db)
            .await?;

        let Some(inserted_row) = row else {
            ctx.send(
                poise::CreateReply::default()
                    .content("You have already reported this message.")
                    .ephemeral(true)
            ).await?;

            return Ok(());
        };

        // This is the actual DB ID (e.g., 10)
        let generated_id = inserted_row.id;

        let payload = ReportedMessagePayload {
            id: generated_id,
            guild_id: guild_id_str,
            message_id,
            channel_id,
            reporter_name,
            author_name,
            reason,
            content: message_content,
            attachment_url: joined_image_urls,
            status: "under_review".to_string(),
        };

        let payload_str = serde_json::to_string(&payload)?;
        let mut redis_conn = ctx.data().redis.clone();
        redis_conn.publish::<_, _, ()>("discord:reports", payload_str).await?;

        ctx.send(
            poise::CreateReply::default()
                .content("Thank you! Your report has been submitted to the moderation_old team.")
                .ephemeral(true)
        ).await?;
    }

    Ok(())
}