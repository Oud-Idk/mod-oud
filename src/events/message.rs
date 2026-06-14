use crate::core::config::get_settings;
use crate::events::handlers::message_filter::rules::{self};
use crate::events::handlers::message_filter::verdict::FilterVerdict;
use crate::events::handlers::message_filter::{spam, verdict};
use crate::events::handlers::starboard::{handle_starboard_reaction_add, handle_starboard_reaction_remove};
use crate::events::handlers::{message_logging, tickets};
use crate::types::config::message_filter::{RuleScope, ScopeMode};
use crate::types::types::{Data, Error};
use serenity::all::{ChannelId, Context, GuildId, Message, MessageId, MessageUpdateEvent, Reaction};

fn should_apply_filter(scope: &RuleScope, channel_id: u64, user_roles: &[u64]) -> bool {
    let is_channel_matched = scope.channels.contains(&channel_id);
    let is_role_matched = user_roles.iter().any(|role| scope.roles.contains(role));
    let is_matched = is_channel_matched || is_role_matched;

    match scope.mode {
        ScopeMode::Exempt => !is_matched,   // If matched, they are exempt (do not filter)
        ScopeMode::Enforced => is_matched,  // If matched, they are enforced (do filter)
    }
}

pub async fn on_message(ctx: &Context, message: &Message, data: &Data) -> Result<(), Error> {
    if message.author.bot {
        return Ok(());
    }

    let Some(guild_id) = message.guild_id else {
        return Ok(());
    };

    let guild_id_i64 = guild_id.get() as i64;
    let guild_id_u64 = guild_id.get();
    let author_id = message.author.id.get();

    // 1. Fetch configuration
    let config = get_settings(&data.db, &data.redis, guild_id_i64).await?;

    // 2. If filtering is configured, run the evaluation pipeline
    if let Some(filtering) = &config.message_filtering {
        if let Some(global_scope) = &filtering.global_settings {
            let member_roles: Vec<u64> = message
                .member
                .as_ref()
                .map(|member| member.roles.iter().map(|role_id| role_id.get()).collect())
                .unwrap_or_default();

            let channel_id_u64 = message.channel_id.get();
            let should_apply_filter = should_apply_filter(global_scope, channel_id_u64, &member_roles);

            if should_apply_filter {
                // State-bound / Rate-limit checks
                let was_spam = spam::handle_spam_prevention(
                    ctx,
                    message,
                    data,
                    filtering,
                    guild_id_u64,
                    author_id,
                ).await?;

                if was_spam {
                    return Ok(());
                }

                // Run the purely synchronous evaluation pipeline
                let mut verdict = rules::filter_bad_words(message, filtering)
                    .or_else(|| rules::filter_offensive_messages(message, filtering))
                    .or_else(|| rules::filter_server_invites(message, filtering))
                    .or_else(|| rules::filter_external_urls(message, filtering))
                    .or_else(|| rules::filter_excessive_caps(message, filtering))
                    .or_else(|| rules::filter_excessive_emojis(message, filtering))
                    .or_else(|| rules::filter_excessive_spoilers(message, filtering))
                    .or_else(|| rules::filter_excessive_mentions(message, filtering))
                    .or_else(|| rules::filter_zalgo(message, filtering));

                // Resolve deferred async checks (like Safe Browsing) only if requested
                if let FilterVerdict::RequiresSafeBrowsingCheck { urls, external_links } = verdict {
                    verdict = verdict::resolve_safe_browsing(data, external_links, &urls).await;
                }

                // Execute the actions associated with the final verdict
                if !verdict.is_pass() {
                    verdict::execute_verdict(ctx, data, message, verdict).await?;
                    return Ok(());
                }
            }
        }
    }

    // 3. Handle downstream handlers (still executed if filtering was skipped)
    tickets::handle_tickets(ctx, message, data).await?;

    Ok(())
}

pub async fn on_message_delete(
    ctx: &Context,
    channel_id: &ChannelId,
    deleted_message_id: &MessageId,
    guild_id: &Option<GuildId>,
    _data: &Data,
) -> Result<(), Error> {
    message_logging::message_log_delete(ctx, channel_id, deleted_message_id, guild_id, _data)
        .await?;
    Ok(())
}

pub async fn on_message_update(
    ctx: &Context,
    old_if_available: Option<&Message>,
    new: Option<&Message>,
    event: &MessageUpdateEvent,
    _data: &Data,
) -> Result<(), Error> {
    message_logging::message_log_update(ctx, old_if_available, new, event, _data).await?;

    Ok(())
}

pub async fn on_reaction_add(ctx: &Context, add_reaction: &Reaction, data: &Data) -> Result<(), Error> {
    handle_starboard_reaction_add(ctx, add_reaction, data).await?;
    Ok(())
}

pub async fn on_reaction_remove(ctx: &Context, removed_reaction: &Reaction, data: &Data) -> Result<(), Error> {
    handle_starboard_reaction_remove(ctx, removed_reaction, data).await?;
    Ok(())
}