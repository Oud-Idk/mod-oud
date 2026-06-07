use std::env;
use std::time::Duration;

use linkify::{LinkFinder, LinkKind};
use once_cell::sync::Lazy;
use poise::serenity_prelude as serenity;
use prost::Message as ProstMessage;
use regex::Regex;
use reqwest::Client;
use rustrict::{Censor, Type};
use serenity::model::channel::Message;
use serenity::model::id::{ChannelId, GuildId};

use crate::commands::helpers::dm::try_dm_message_action;
use crate::core::config::get_settings;
use crate::types::flag::{FlagSeverity, ThreatType};
use crate::types::types::{Data, Error, SearchUrlsResponse};
use crate::utils::logger::{log_offensive_message, log_scam_message, log_spam_message};

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

    // Call the new async Redis-backed check
    let is_spamming = data
        .spam_tracker
        .check_and_record_async(guild_id, author_id, spam_limit, spam_window)
        .await?;

    if is_spamming {
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

        // Call the new async Redis-backed warning cooldown check
        let should_warn = data
            .spam_tracker
            .check_warning_cooldown_async(guild_id, author_id, warning_cooldown)
            .await?;

        // Only send a warning to the channel if the warning cooldown has expired
        if should_warn {
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

fn extract_urls(text: &str) -> Vec<&str> {
    let mut finder = LinkFinder::new();
    finder.kinds(&[LinkKind::Url]);

    let urls: Vec<&str> = finder.links(text).map(|link| link.as_str()).collect();

    urls
}

pub async fn process_scam_filters(
    ctx: &serenity::Context,
    message: &Message,
    data: &Data,
    guild_id: GuildId,
) -> Result<(), Error> {
    let Ok(api_key) = env::var("SAFE_BROWSING_KEY") else {
        return Ok(());
    };

    let client = Client::new();
    let endpoint = "https://safebrowsing.googleapis.com/v5/urls:search";
    let urls = extract_urls(message.content.as_str());

    let mut query_params = vec![("key".to_string(), api_key.to_string())];

    for url in urls {
        query_params.push(("urls".to_string(), url.to_string()));
    }

    let response = client.get(endpoint).query(&query_params).send().await?;

    if !response.status().is_success() {
        return Err(format!("API Error: {}", response.text().await?).into());
    }

    let bytes = response.bytes().await?;
    let search_response = SearchUrlsResponse::decode(bytes)?;
    let channel_id = message.channel_id.get();
    let author_id = message.author.id.get();
    let mut threats_int: Vec<i32> = Vec::new();

    if !search_response.threats.is_empty() {
        for threat in search_response.threats {
            threats_int.extend(threat.threat_types);
        }
        threats_int.sort();
        threats_int.dedup();
        log_scam_message(
            ctx,
            data,
            guild_id.get(),
            message.channel_id.get(),
            message.id.get(),
            author_id,
            &message.content,
            threats_int.as_slice(),
        )
            .await?;
        let threats_str = threats_int
            .into_iter()
            .map(|threat_type| format!("{}", ThreatType::from(threat_type)))
            .collect::<Vec<String>>();

        message.delete(&ctx.http).await?;

        alert_user(
            ctx,
            guild_id,
            message,
            channel_id,
            "containing scam URls",
            Some(&[("Flags", &threats_str.join(", "))]),
        )
            .await?;
    }

    Ok(())
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

    let config = get_settings(&data.db, &data.redis, guild_id.get() as i64).await?;

    log_offensive_message(
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

        alert_user(
            ctx,
            guild_id,
            message,
            channel_id,
            "violating automated content policies",
            None,
        )
            .await?;
    }

    Ok(())
}

async fn alert_user(
    ctx: &serenity::Context,
    guild_id: GuildId,
    message: &Message,
    channel_id: u64,
    reason: &str,
    extra_fields: Option<&[(&str, &str)]>,
) -> Result<(), Error> {
    let author_id = message.author.id.get();
    let channel_mention = format!("<#{}>", channel_id);

    let mut fields: Vec<(&str, &str)> =
        vec![("Channel", &channel_mention), ("Message", &message.content)];
    if let Some(extra_fields) = extra_fields {
        fields.extend(extra_fields);
    }

    let dm_result = try_dm_message_action(
        ctx,
        Some(guild_id),
        &message.author,
        "Message Flagged and Removed".to_string(),
        0xED4245, // Red color
        format!("Your message was automatically removed for {}.", reason).as_str(),
        fields.as_slice(),
    )
        .await;

    if dm_result.is_err() {
        send_temp_warning(
            ctx,
            message.channel_id,
            format!("<@{}>, your message was removed for {}.", author_id, reason, ),
            Duration::from_secs(5),
        )
            .await;
    }

    Ok(())
}
