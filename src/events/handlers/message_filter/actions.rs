use crate::events::handlers::message_filter::database;
use crate::types::config::config::GuildSettings;
use crate::types::config::message_filter::{BaseRule, RuleAction};
use crate::types::Data;
use crate::utils::moderation::issuing::{issue_mute, issue_warning};
use serenity::all::{ChannelId, CreateEmbed, CreateEmbedFooter, CreateMessage, EditMember, Mentionable, Message, Timestamp, User};
use std::time::Duration;
use tracing::{debug, error, info, instrument, trace, warn};

/// Helper function to send a message that deletes itself after a set duration.
#[instrument(skip(ctx, channel_id))]
async fn send_temp_warning(
    ctx: &serenity::all::Context,
    channel_id: ChannelId,
    content: String,
    duration: Duration,
) {
    if let Ok(temp_msg) = channel_id.say(&ctx.http, content).await {
        let http = ctx.http.clone(); // Clone only the Arc<Http> instead of the entire Context
        let temp_msg_id = temp_msg.id;
        tokio::spawn(async move {
            tokio::time::sleep(duration).await;
            if let Err(err) = temp_msg.delete(&http).await {
                warn!(error = %err, message_id = %temp_msg_id.get(), "Failed to remove temporary warning message");
            } else {
                trace!(message_id = %temp_msg_id.get(), "Cleaned up temporary warning message");
            }
        });
    } else {
        warn!("Failed to dispatch temporary channel warning message");
    }
}

#[instrument(
    skip(ctx, message, db, redis_conn, guild_configs),
    fields(
        user_id = %message.author.id.get(),
        rule = rule_name
    )
)]
pub async fn apply_warning(
    ctx: &serenity::all::Context,
    rule_name: &str,
    message: &Message,
    db: &sqlx::PgPool,
    redis_conn: &fred::clients::Client,
    guild_configs: &moka::future::Cache<i64, GuildSettings>,
) {
    let Some(guild_id) = message.guild_id else {
        trace!("Skipping automated warning: Message was not sent in a guild.");
        return;
    };

    let user_id = message.author.id;

    let (moderator_id, moderator_username) = {
        let bot_user = ctx.cache.current_user();
        (bot_user.id, bot_user.name.clone())
    };

    let target_username = message.author.name.clone();
    let reason_str = format!("Automated Filter: {}", rule_name);

    let http = ctx.http.clone();

    match issue_warning(
        db,
        redis_conn,
        guild_configs,
        &http,
        guild_id,
        user_id,
        moderator_id,
        &reason_str,
        &moderator_username,
        &target_username,
    )
        .await
    {
        Ok(warn_id) => {
            info!(warn_id, "Automated filter successfully issued warning and executed threshold actions");
        }
        Err(err) => {
            error!(error = %err, "Failed to apply automated warning via issue_warning");
        }
    }
}

#[instrument(
    skip(ctx, message, base, db, redis_conn, guild_configs),
    fields(
        user_id = %message.author.id.get()
    )
)]
pub async fn apply_mute(
    ctx: &serenity::all::Context,
    rule_name: &str,
    message: &Message,
    base: &BaseRule,
    db: &sqlx::PgPool,
    redis_conn: &fred::clients::Client,
    guild_configs: &moka::future::Cache<i64, GuildSettings>,
) {
    let Some(guild_id) = message.guild_id else { return; };
    let Some(duration_secs) = base.timeout_duration_seconds else { return; };

    let duration = std::time::Duration::from_secs(duration_secs as u64);
    let now_secs = Timestamp::now().unix_timestamp();

    let Some(timeout_until) = Timestamp::from_unix_timestamp(now_secs + duration_secs as i64).ok() else {
        error!("Could not calculate a valid mute timestamp");
        return;
    };

    let user = message.author.clone();

    let moderator: User = ctx.cache.current_user().clone().into();

    let reason_str = format!("Automated Filter: {}", rule_name);
    let http = ctx.http.clone();

    match issue_mute(
        db,
        redis_conn,
        guild_configs,
        &http,
        guild_id,
        user,
        moderator,
        &reason_str,
        &duration,
        timeout_until,
    )
        .await
    {
        Ok(()) => {
            info!(duration_secs, "Successfully timed out user via automated mute");
        }
        Err(err) => {
            error!(error = %err, "Failed to apply automated timeout");
        }
    }
}

#[instrument(
    skip(ctx, message),
    fields(
        user_id = %message.author.id.get(),
        channel_id = %message.channel_id.get()
    )
)]
pub async fn apply_public_reminder(
    ctx: &serenity::all::Context,
    message: &Message,
    rule_name: &str,
) {
    trace!("Sending public automod violation warning");
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

#[instrument(
    skip(ctx, message),
    fields(
        user_id = %message.author.id.get()
    )
)]
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
    trace!("Sending private direct message automod warning");
    if let Err(err) = message.author.dm(&ctx.http, builder).await {
        warn!(error = %err, "Direct message reminder delivery failed");
    }
}

#[instrument(
    skip_all,
    fields(
        rule = rule_name,
        user_id = %message.author.id.get(),
        channel_id = %message.channel_id.get()
    )
)]
pub async fn execute_rule_actions(
    ctx: &serenity::all::Context,
    data: &Data,
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

    debug!(?actions_taken, "Executing configured actions for matched rule");
    if should_warn.unwrap_or(true) {
        log_automod_event(&data.db, message, rule_name, trigger_content, &actions_taken).await;
    } // This if statement is to prevent spamming the shit out of my poor database
    handle_automod(ctx, message, base, data, rule_name, should_warn, custom_dm_message).await;
}

pub async fn log_automod_event(
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
        Some(channel_id),
        Some(message_id),
        rule_name,
        trigger_content,
        Some(&message.content),
        actions_taken,
        &message.author.name,
    )
        .await
    {
        error!(error = %err, "Unable to insert automod log record into database");
    }
}

async fn handle_automod(
    ctx: &serenity::all::Context,
    message: &Message,
    base: &BaseRule,
    data: &Data,
    rule_name: &str,
    should_warn: Option<bool>,
    custom_dm_message: Option<&str>,
) {
    let warn_enabled = should_warn.unwrap_or(true);

    for action in &base.action {
        trace!(?action, "Applying target configuration action");
        match action {
            RuleAction::Delete => {
                if let Err(err) = message.delete(&ctx.http).await {
                    warn!(error = %err, "Could not delete flagged message");
                }
            }
            RuleAction::Warn => {
                apply_warning(ctx, rule_name, message, &data.db, &data.redis, &data.guild_configs).await;
            }
            RuleAction::Timeout => {
                apply_mute(ctx, rule_name, message, base, &data.db, &data.redis, &data.guild_configs).await;
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