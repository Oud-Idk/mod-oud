use crate::events::handlers::message_filter::verdict::FilterVerdict;
use crate::types::config::config::GuildSettings;
use crate::types::config::message_filter::{RuleScope, ScopeMode};
use crate::types::{Data, Error};
use serenity::all::{Context, Message};
use tracing::{debug, instrument, trace};

pub mod rules;
pub mod utils;
pub mod actions;
pub mod database;
pub mod verdict;
pub mod spam;

fn should_apply_filter(scope: &RuleScope, channel_id: u64, user_roles: &[u64]) -> bool {
    let is_channel_matched = scope.channels.contains(&channel_id);
    let is_role_matched = user_roles.iter().any(|role| scope.roles.contains(role));
    let is_matched = is_channel_matched || is_role_matched;

    let result = match scope.mode {
        ScopeMode::Exempt => !is_matched,
        ScopeMode::Enforced => is_matched,
    };

    trace!(
        is_matched,
        result,
        channel_id,
        "Checked filter applicability for scope"
    );
    result
}

#[instrument(
    name = "handle_filtering",
    skip(ctx, data, config, message),
    fields(
        guild_id = tracing::field::Empty,
        author_id = %message.author.id.get(),
        channel_id = %message.channel_id.get(),
        message_id = %message.id.get()
    )
)]
pub async fn handle_filtering(
    ctx: &Context,
    data: &Data,
    config: &GuildSettings,
    message: &Message,
) -> Result<bool, Error> {
    let Some(guild_id) = message.guild_id else {
        trace!("Message does not belong to a guild; skipping filter evaluation");
        return Ok(false);
    };

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
        Some(global_scope) => should_apply_filter(global_scope, channel_id_u64, &member_roles),
        None => true, // If no global settings are present, we don't bypass
    };

    if !should_apply {
        trace!("Filter evaluation bypassed by global settings");
        return Ok(false);
    }

    let bad_word_rulesets = database::get_active_bad_word_rulesets(
        data,
        guild_id_u64 as i64
    ).await?;

    let mut verdict = rules::filter_bad_words(message, &bad_word_rulesets);

    if verdict.is_pass() {
        if let Some(filtering) = &config.message_filtering {
            if filtering.global_settings.is_some() {
                trace!("Evaluating filters for message");
                let was_spam = spam::handle_spam_prevention(
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
                    .or_else(|| rules::filter_offensive_messages(message, filtering))
                    .or_else(|| rules::filter_server_invites(message, filtering))
                    .or_else(|| rules::filter_external_urls(message, filtering))
                    .or_else(|| rules::filter_excessive_caps(message, filtering))
                    .or_else(|| rules::filter_excessive_emojis(message, filtering))
                    .or_else(|| rules::filter_excessive_spoilers(message, filtering))
                    .or_else(|| rules::filter_excessive_mentions(message, filtering))
                    .or_else(|| rules::filter_zalgo(message, filtering));
            } else {
                trace!("Global scope not found; skipping configuration-dependent filters");
            }
        } else {
            trace!("Message filtering config not found; skipping configuration-dependent filters");
        }
    }

    if let FilterVerdict::RequiresSafeBrowsingCheck { urls, external_links } = verdict {
        trace!("Verifying potentially unsafe external URLs via Safe Browsing API");
        verdict = verdict::resolve_safe_browsing(data, external_links, &urls).await;
    }

    if !verdict.is_pass() {
        debug!(?verdict, "Message flag matched; executing filter verdict actions");
        verdict::execute_verdict(ctx, data, message, verdict).await?;
        return Ok(true);
    }

    trace!("Message passed all active filters");
    Ok(false)
}