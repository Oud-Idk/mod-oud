use super::database::log_automod_event;
use crate::{Data, UserUpdate};
use crate::core::config::settings::GuildSettings;
use crate::features::automod::types::{BaseRule, RuleAction};
use crate::features::moderation::issue_mute;
use crate::features::warning::issue_warning;
use serenity::all::{ChannelId, CreateMessage, Mentionable, Message, Timestamp, User};
use std::time::Duration;
use tracing::{debug, error, info, instrument, trace, warn};

#[instrument(
    skip_all,
    fields(rule = rule_name, user_id = %message.author.id.get(), channel_id = %message.channel_id.get()
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
    let actions_taken: Vec<&'static str> = base.action.iter().map(|a| a.as_str()).collect();

    debug!(?actions_taken, "Executing configured actions for matched rule");

    if should_warn.unwrap_or(true) {
        if let Err(e) = log_automod_event(&data.db, message, rule_name, trigger_content, &actions_taken).await {
            error!(error = %e, "Failed to log automod event");
        }
    } // This if statement is to prevent spamming the shit out of my poor database

    handle_automod(ctx, message, base, data, rule_name, should_warn, custom_dm_message).await;
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
                apply_warning(ctx, rule_name, message, &data.db, &data.redis, &data.guild_configs, &data.username_buf_tx).await;
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

#[instrument(skip(ctx, message, db, redis_conn, guild_configs), fields(user_id = %message.author.id.get(), rule = rule_name
))]
async fn apply_warning(
    ctx: &serenity::all::Context,
    rule_name: &str,
    message: &Message,
    db: &sqlx::PgPool,
    redis_conn: &fred::clients::Client,
    guild_configs: &moka::future::Cache<i64, GuildSettings>,
    username_buf_tx: &tokio::sync::mpsc::Sender<UserUpdate>,
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
        db, redis_conn, guild_configs, &username_buf_tx, &http, guild_id, user_id, moderator_id,
        &reason_str, &moderator_username, &target_username,
    ).await {
        Ok(warn_id) => info!(warn_id, "Automated filter successfully issued warning and executed threshold actions"),
        Err(err) => error!(error = %err, "Failed to apply automated warning via issue_warning"),
    }
}

#[instrument(skip(ctx, message, base, db, redis_conn, guild_configs), fields(user_id = %message.author.id.get()
))]
async fn apply_mute(
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

    let duration = Duration::from_secs(duration_secs);
    let now_secs = Timestamp::now().unix_timestamp();
    let Some(timeout_until) = Timestamp::from_unix_timestamp(now_secs + duration_secs as i64).ok() else {
        error!("Could not calculate a valid mute timestamp");
        return;
    };

    let user = message.author.clone();
    let moderator: User = ctx.cache.current_user().clone().into();
    let reason_str = format!("Automated Filter: {}", rule_name);
    let http = ctx.http.clone();

    match issue_mute(db, redis_conn, guild_configs, &http, guild_id, user, moderator, &reason_str, &duration, timeout_until).await {
        Ok(()) => info!(duration_secs, "Successfully timed out user via automated mute"),
        Err(err) => error!(error = %err, "Failed to apply automated timeout"),
    }
}

#[instrument(skip(ctx, message), fields(user_id = %message.author.id.get(), channel_id = %message.channel_id.get()
))]
async fn apply_public_reminder(ctx: &serenity::all::Context, message: &Message, rule_name: &str) {
    trace!("Sending public automod violation warning");
    send_temp_warning(
        ctx,
        message.channel_id,
        format!("{}, your message was flagged for violating a server filter rule ({}).", message.author.mention(), rule_name),
        Duration::from_secs(5),
    ).await;
}

#[instrument(skip(ctx, message), fields(user_id = %message.author.id.get()))]
async fn apply_private_reminder(ctx: &serenity::all::Context, message: &Message, rule_name: &str, custom_dm_message: Option<&str>) {
    let builder = match custom_dm_message {
        Some(custom) => CreateMessage::new().content(custom),
        None => CreateMessage::new().content(format!("Your message was flagged for violating a server filter rule ({}).", rule_name)),
    };
    trace!("Sending private direct message automod warning");
    if let Err(err) = message.author.dm(&ctx.http, builder).await {
        warn!(error = %err, "Direct message reminder delivery failed");
    }
}

/// Helper function to send a message that deletes itself after a set duration.
#[instrument(skip(ctx, channel_id))]
async fn send_temp_warning(ctx: &serenity::all::Context, channel_id: ChannelId, content: String, duration: Duration) {
    if let Ok(temp_msg) = channel_id.say(&ctx.http, content).await {
        let http = ctx.http.clone();
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