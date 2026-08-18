mod crypto_address;
mod excessive_caps;
mod excessive_emojis;
mod excessive_mentions;
mod excessive_spoilers;
mod external_urls;
mod honeypot;
mod native_rules;
mod offensive_messages;
mod server_invites;
mod spam;
mod zalgo;

use crate::core::config::settings::get_settings;
use crate::core::config::state::{BotData, Error};
use crate::features::automod::events::spam::handle_spam_prevention;
use crate::features::automod::rules::should_apply_filter;
use crate::features::automod::types::FilterVerdict;
use crate::features::automod::verdict::execute_verdict;
use crate::features::bad_words::{filter_bad_words, get_active_bad_word_rulesets};
use anyhow::Result;
pub use honeypot::handle_honeypot;
pub use native_rules::store_automod;
use poise::serenity_prelude::{Context, Message};
use tracing::{debug, instrument, trace};

#[instrument(
    name = "handle_filtering",
    skip(ctx, data, message),
    fields(
        guild_id = tracing::field::Empty,
        author_id = %message.author.id.get(),
        channel_id = %message.channel_id.get(),
        message_id = %message.id.get()
    )
)]
pub async fn check_for_filter(
    ctx: &Context,
    data: &BotData,
    message: &Message,
) -> Result<bool, Error> {
    if message.author.bot {
        return Ok(false);
    }

    let Some(guild_id) = message.guild_id else {
        trace!("Message does not belong to a guild; skipping filter evaluation");
        return Ok(false);
    };

    let config = get_settings(
        &data.core.db,
        &data.core.redis,
        &data.core.guild_configs_cache,
        guild_id,
    )
        .await?;

    let guild_id = guild_id;
    tracing::Span::current().record("guild_id", guild_id.get());

    let author_id = message.author.id;
    let channel_id = message.channel_id;

    let global_settings = config
        .message_filtering
        .as_ref()
        .and_then(|f| f.global_settings.as_ref());

    let should_apply = global_settings.is_none_or(|global_scope| {
        should_apply_filter(global_scope, channel_id, message.member.as_deref())
    });

    if !should_apply {
        trace!("Filter evaluation bypassed by global settings");
        return Ok(false);
    }

    let Some(filtering) = &config.message_filtering else {
        trace!("Message filtering config not found; skipping filters");
        return Ok(false);
    };

    if filtering.global_settings.is_none() {
        trace!("Global scope not found; skipping configuration-dependent filters");
        return Ok(false);
    }

    let bad_word_rulesets = get_active_bad_word_rulesets(data, guild_id).await?;
    let mut verdict = filter_bad_words(message, &bad_word_rulesets);

    if verdict.is_pass() {
        trace!("Evaluating filters for message");

        let was_spam =
            handle_spam_prevention(ctx, message, data, filtering, guild_id, author_id).await?;

        if was_spam {
            debug!("Message blocked by spam prevention system");
            return Ok(true);
        }

        verdict = verdict
            .or_else(|| offensive_messages::filter_offensive_messages(message, filtering))
            .or_else(|| server_invites::filter_server_invites(message, filtering))
            .or_else(|| external_urls::filter_external_urls(message, filtering))
            .or_else(|| excessive_caps::filter_excessive_caps(message, filtering))
            .or_else(|| excessive_emojis::filter_excessive_emojis(message, filtering))
            .or_else(|| excessive_spoilers::filter_excessive_spoilers(message, filtering))
            .or_else(|| excessive_mentions::filter_excessive_mentions(message, filtering))
            .or_else(|| zalgo::filter_zalgo(message, filtering))
            .or_else(|| crypto_address::filter_crypto_addresses(message, filtering));
    }

    if let FilterVerdict::RequiresSafeBrowsingCheck {
        urls,
        external_links,
    } = verdict
    {
        trace!("Verifying potentially unsafe external URLs via Safe Browsing API");
        verdict = external_urls::resolve_safe_browsing(data, external_links, &urls).await;
    }

    if !verdict.is_pass() {
        debug!(
            ?verdict,
            "Message flag matched; executing filter verdict actions"
        );
        execute_verdict(ctx, data, message, verdict).await?;
        return Ok(true);
    }

    trace!("Message passed all active filters");
    Ok(false)
}

/// Handles automod for every `Message` event.
///
/// # Errors
/// Returns `Err` if any stage (honeypot, offensive messages, server invites, etc) fails due to
/// an HTTP, DB, or Redis error.
pub async fn handle_automod(
    ctx: &Context,
    message: &Message,
    data: &BotData,
) -> Result<bool, Error> {
    if handle_honeypot(ctx, message, data).await? {
        return Ok(true);
    }

    if check_for_filter(ctx, data, message).await? {
        return Ok(true);
    }

    Ok(false)
}
