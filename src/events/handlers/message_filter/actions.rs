use crate::events::handlers::message_filter::database;
use crate::types::config::message_filter::{BaseRule, RuleAction};
use serenity::all::{
    ChannelId, CreateEmbed, CreateEmbedFooter, CreateMessage, EditMember, Mentionable, Message, Timestamp,
};
use std::time::Duration;

/// Helper function to send a message that deletes itself after a set duration.
async fn send_temp_warning(
    ctx: &serenity::all::Context,
    channel_id: ChannelId,
    content: String,
    duration: Duration,
) {
    if let Ok(temp_msg) = channel_id.say(&ctx.http, content).await {
        let http = ctx.http.clone(); // Clone only the Arc<Http> instead of the entire Context
        tokio::spawn(async move {
            tokio::time::sleep(duration).await;
            let _ = temp_msg.delete(&http).await;
        });
    }
}

pub async fn apply_warning(
    ctx: &serenity::all::Context,
    rule_name: &str,
    message: &Message,
    db: &sqlx::PgPool,
) {
    let reason_str = format!("Automated Filter: {}", rule_name);

    let guild_id = message.guild_id.unwrap_or_default().get() as i64;
    let user_id = message.author.id.get() as i64;
    let bot_id = ctx.cache.current_user().id.get() as i64;

    match database::insert_warning(db, guild_id, user_id, bot_id, &reason_str).await {
        Ok(Some(warn_id)) => {
            let guild_name = message
                .guild_id
                .and_then(|id| id.name(&ctx.cache));

            // Avoid allocating "the server".to_string() for the fallback case
            let guild_name_ref = guild_name.as_deref().unwrap_or("the server");

            let embed = CreateEmbed::new()
                .title(format!("You have been formally warned from {}", guild_name_ref))
                .color(0xFF4747)
                .field("Reason", &reason_str, false)
                .field("ID", warn_id.to_string(), false) // More idiomatic than format!("{}", warn_id)
                .footer(CreateEmbedFooter::new(
                    "This is an automated moderation_old action. If you believe this was a mistake, please create a ticket on the server.",
                ));

            let dm = CreateMessage::new().embed(embed);
            let _ = message.author.dm(&ctx.http, dm).await;
        }
        Err(err) => {
            eprintln!("Failed to insert warning into DB: {:?}", err);
        }
        Ok(None) => {}
    }
}

pub async fn apply_mute(
    ctx: &serenity::all::Context,
    message: &Message,
    base: &BaseRule,
) {
    // Clean up nesting using modern let-else syntax
    let Some(guild_id) = message.guild_id else { return; };
    let Some(duration_secs) = base.timeout_duration_seconds else { return; };

    // Calculate timeout natively with Serenity's Timestamp type
    let now_secs = Timestamp::now().unix_timestamp();
    if let Ok(timeout_until) = Timestamp::from_unix_timestamp(now_secs + duration_secs as i64) {
        let builder = EditMember::new().disable_communication_until_datetime(timeout_until);

        // Directly edit the member on the guild, saving a GET HTTP request
        if let Err(err) = guild_id.edit_member(&ctx.http, message.author.id, builder).await {
            eprintln!("Failed to timeout user {}: {:?}", message.author.id, err);
        }
    }
}

pub async fn apply_public_reminder(
    ctx: &serenity::all::Context,
    message: &Message,
    rule_name: &str,
) {
    send_temp_warning(
        ctx,
        message.channel_id,
        format!(
            "{}, your message was flagged for violating a server filter rule ({}).",
            message.author.mention(), // Uses Serenity's built-in Mentionable trait
            rule_name
        ),
        Duration::from_secs(5),
    )
        .await;
}

pub async fn apply_private_reminder(
    ctx: &serenity::all::Context,
    message: &Message,
    rule_name: &str,
    custom_dm_message: Option<&str>,
) {
    // Lazily construct the builder, avoiding redundant formatting if custom message is Some
    let builder = match custom_dm_message {
        Some(custom) => CreateMessage::new().content(custom),
        None => CreateMessage::new().content(format!(
            "Your message was flagged for violating a server filter rule ({}).",
            rule_name
        )),
    };

    // Use the single DM API wrapper
    let _ = message.author.dm(&ctx.http, builder).await;
}

pub async fn execute_rule_actions(
    ctx: &serenity::all::Context,
    db: &sqlx::PgPool,
    message: &Message,
    base: &BaseRule,
    rule_name: &str,
    trigger_content: Option<&str>,
    custom_dm_message: Option<&str>,
    should_warn: Option<bool>,
) {
    let actions_taken: Vec<&'static str> = base.action
        .iter()
        .map(|action| action.as_str())
        .collect();

    log_automod_event(db, message, rule_name, trigger_content, &actions_taken).await;
    handle_automod(ctx, message, base, db, rule_name, should_warn, custom_dm_message).await;
}

async fn log_automod_event(
    db: &sqlx::PgPool,
    message: &Message,
    rule_name: &str,
    trigger_content: Option<&str>,
    actions_taken: &[&'static str],
) {
    let guild_id = message.guild_id.unwrap_or_default().get() as i64;
    let user_id = message.author.id.get() as i64;
    let channel_id = message.channel_id.get() as i64;
    let message_id = message.id.get() as i64;

    if let Err(err) = database::insert_automod_log(
        db,
        guild_id,
        user_id,
        channel_id,
        message_id,
        rule_name,
        trigger_content,
        &message.content,
        actions_taken,
    )
        .await
    {
        eprintln!("Failed to write automod log to DB: {:?}", err);
    }
}

async fn handle_automod(
    ctx: &serenity::all::Context,
    message: &Message,
    base: &BaseRule,
    db: &sqlx::PgPool,
    rule_name: &str,
    should_warn: Option<bool>,
    custom_dm_message: Option<&str>,
) {
    let warn_enabled = should_warn.unwrap_or(true);

    for action in &base.action {
        match action {
            RuleAction::Delete => {
                let _ = message.delete(&ctx.http).await;
            }
            RuleAction::Warn => {
                let _ = apply_warning(ctx, rule_name, message, db).await;
            }
            RuleAction::Timeout => {
                let _ = apply_mute(ctx, message, base).await;
            }
            RuleAction::RemindPublicly => {
                if warn_enabled {
                    apply_public_reminder(ctx, message, rule_name).await;
                }
            }
            RuleAction::RemindPrivately => {
                if warn_enabled {
                    apply_private_reminder(ctx, message, rule_name, custom_dm_message).await;
                }
            }
        }
    }
}