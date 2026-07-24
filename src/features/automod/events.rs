mod honeypot;
mod offensive_messages;
mod excessive_caps;
mod excessive_emojis;
mod server_invites;
mod zalgo;
mod excessive_mentions;
mod excessive_spoilers;
mod external_urls;
mod spam;
mod native_rules;

use crate::core::config::settings::{get_settings, GuildSettings};
use crate::features::automod::types::FilterVerdict;
use crate::features::bad_words::{filter_bad_words, get_active_bad_word_rulesets};
use crate::features::{automod, bad_words};
use anyhow::Result;
pub use honeypot::handle_honeypot;
pub use native_rules::store_automod;
use crate::{Data, Error};
use poise::serenity_prelude::{Context, GuildId, Message};
use std::result;
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
    data: &Data,
    message: &Message,
) -> Result<bool, Error> {
    if message.author.bot { return Ok(false); }

    let Some(guild_id) = message.guild_id else {
        trace!("Message does not belong to a guild; skipping filter evaluation");
        return Ok(false);
    };

    let config = get_settings(&data.db, &data.redis, &data.guild_configs, guild_id.get() as i64).await?;

    let guild_id_u64 = guild_id.get();
    tracing::Span::current().record("guild_id", guild_id_u64);

    let author_id = message.author.id.get();
    let channel_id_u64 = message.channel_id.get();

    let member_roles: Vec<u64> = message
        .member
        .as_ref()
        .map(|member| member.roles.iter().map(|role_id| role_id.get()).collect())
        .unwrap_or_default();

    let global_settings = config
        .message_filtering
        .as_ref()
        .and_then(|f| f.global_settings.as_ref());

    let should_apply = match global_settings {
        Some(global_scope) => automod::rules::should_apply_filter(global_scope, channel_id_u64, &member_roles),
        None => true, // If no global settings are present, we don't bypass
    };

    if !should_apply {
        trace!("Filter evaluation bypassed by global settings");
        return Ok(false);
    }


    let bad_word_rulesets = get_active_bad_word_rulesets(data, guild_id_u64 as i64).await?;
    let mut verdict = filter_bad_words(message, &bad_word_rulesets);

    if verdict.is_pass() {
        if let Some(filtering) = &config.message_filtering {
            if filtering.global_settings.is_some() {
                trace!("Evaluating filters for message");
                let was_spam = automod::events::spam::handle_spam_prevention(
                    ctx,
                    message,
                    data,
                    filtering,
                    guild_id_u64,
                    author_id,
                ).await?;

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
                    .or_else(|| zalgo::filter_zalgo(message, filtering));
            } else {
                trace!("Global scope not found; skipping configuration-dependent filters");
            }
        } else {
            trace!("Message filtering config not found; skipping configuration-dependent filters");
        }
    }

    if let FilterVerdict::RequiresSafeBrowsingCheck { urls, external_links } = verdict {
        trace!("Verifying potentially unsafe external URLs via Safe Browsing API");
        verdict = external_urls::resolve_safe_browsing(data, external_links, &urls).await;
    }

    if !verdict.is_pass() {
        debug!(?verdict, "Message flag matched; executing filter verdict actions");
        automod::verdict::execute_verdict(ctx, data, message, verdict).await?;
        return Ok(true);
    }

    trace!("Message passed all active filters");
    Ok(false)
}

pub async fn is_automod_actioned(ctx: &Context, message: &Message, data: &Data) -> Result<bool, Error> {
    if handle_honeypot(ctx, message, data).await? {
        return Ok(true);
    }

    if check_for_filter(ctx, data, message).await? {
        return Ok(true);
    }

    Ok(false)
}