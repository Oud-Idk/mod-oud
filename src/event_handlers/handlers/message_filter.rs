use std::time::Duration;

use linkify::{LinkFinder, LinkKind};
use once_cell::sync::Lazy;
use poise::serenity_prelude as serenity;
use regex::Regex;
use rustrict::{Censor, Type};
use serenity::model::channel::Message;
use serenity::model::id::{ChannelId, GuildId};

use crate::commands::helpers::dm::try_dm_message_action;
use crate::utils::logger::log_spam_message;
use crate::{
    Data, Error,
    utils::{
        config::get_settings,
        logger::{FlagSeverity, log_flagged_message},
    },
};

// Matches Discord mentions (<@id>, <@&id>), channels (<#id>), and custom emojis (<:name:id> or <a:name:id>)
static DISCORD_FORMAT_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"<(?:a?:[a-zA-Z0-9_]+:|@&?|#)\d+>").unwrap());

fn remove_urls(input: &str) -> String {
    let finder = LinkFinder::new();
    let mut cleaned = String::new();
    let mut last_pos = 0;

    for link in finder.links(input) {
        if link.kind() == &LinkKind::Url {
            cleaned.push_str(&input[last_pos..link.start()]);
            last_pos = link.end();
        }
    }
    cleaned.push_str(&input[last_pos..]);
    cleaned
}

/// Helper function to send a message that deletes itself after a set duration.
async fn send_temp_warning(
    ctx: &serenity::Context,
    channel_id: ChannelId,
    content: String,
    duration: Duration,
) {
    if let Ok(temp_msg) = channel_id.say(&ctx.http, content).await {
        let ctx_clone = ctx.clone();
        tokio::spawn(async move {
            tokio::time::sleep(duration).await;
            let _ = temp_msg.delete(&ctx_clone.http).await;
        });
    }
}

/// Cleans raw text of URLs and specific Discord formatting elements.
fn clean_message_content(content: &str) -> String {
    let cleaned_urls = remove_urls(content);
    DISCORD_FORMAT_REGEX
        .replace_all(&cleaned_urls, "")
        .into_owned()
}

/// Checks the spam tracker and handles deletions/warnings if the limit is exceeded.
/// Returns `Ok(true)` if spam was detected, indicating execution should stop.
pub async fn handle_spam_prevention(
    ctx: &serenity::Context,
    message: &Message,
    data: &Data,
    guild_id: u64,
    author_id: u64,
) -> Result<bool, Error> {
    let spam_limit = 5;
    let spam_window = Duration::from_secs(4);
    let warning_cooldown = Duration::from_secs(5); // Minimum time between warning messages

    if data
        .spam_tracker
        .check_and_record(guild_id, author_id, spam_limit, spam_window)
    {
        // Log the spam instance to the message logs
        log_spam_message(
            ctx,
            data,
            guild_id,
            message.channel_id.get(),
            message.id.get(),
            author_id,
            &message.content,
        )
        .await?;

        // Always delete the spam message immediately
        let _ = message.delete(&ctx.http).await;

        // Only send a warning to the channel if the warning cooldown has expired
        if data
            .spam_tracker
            .check_warning_cooldown(guild_id, author_id, warning_cooldown)
        {
            send_temp_warning(
                ctx,
                message.channel_id,
                format!(
                    "<@{}>, please slow down. Spamming is not allowed.",
                    author_id
                ),
                Duration::from_secs(5),
            )
            .await;
        }

        return Ok(true); // Stop further processing for this message
    }

    Ok(false)
}

/// Analyzes message content, logs severity issues, and handles deletion/user warnings if necessary.
pub async fn process_moderation_filters(
    ctx: &serenity::Context,
    message: &Message,
    data: &Data,
    guild_id: GuildId,
) -> Result<(), Error> {
    let cleaned_content = clean_message_content(&message.content);
    let analysis = Censor::from_str(&cleaned_content).analyze();

    let Some(severity) = FlagSeverity::from_analysis(analysis) else {
        return Ok(());
    };

    let author_id = message.author.id.get();
    let channel_id = message.channel_id.get();
    let message_id = message.id.get();

    let config = get_settings(&data.db, guild_id.get() as i64).await?;

    log_flagged_message(
        ctx,
        data,
        guild_id.get(),
        channel_id,
        message_id,
        author_id,
        &message.content,
        severity,
    )
    .await?;

    let Some(filter_above) = config.message_filter_above else {
        return Ok(());
    };

    let filter_to = match filter_above {
        FlagSeverity::Mild => Type::MILD_OR_HIGHER,
        FlagSeverity::Moderate => Type::MODERATE_OR_HIGHER,
        FlagSeverity::Severe => Type::SEVERE,
    };

    if analysis.is(filter_to) {
        message.delete(&ctx.http).await?;

        let dm_result = try_dm_message_action(
            ctx,
            Some(guild_id),
            &message.author,
            "Message Flagged and Removed".to_string(),
            0xED4245, // Red color
            "Your message was automatically removed due to violating automated content policies.",
            &[
                ("Channel", &format!("<#{}>", channel_id)),
                ("Message", &message.content),
            ],
        )
        .await;

        if dm_result.is_err() {
            send_temp_warning(
                ctx,
                message.channel_id,
                format!(
                    "<@{}>, your message was removed for violating content policies.",
                    author_id
                ),
                Duration::from_secs(5),
            )
            .await;
        }
    }

    Ok(())
}
