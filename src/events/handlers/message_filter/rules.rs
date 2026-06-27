use crate::events::handlers::message_filter::utils;
use crate::events::handlers::message_filter::utils::{DISCORD_EMOJI_REGEX, DISCORD_PING_REGEX, INVITE_REGEX};
use crate::events::handlers::message_filter::verdict::FilterVerdict;
use crate::types::config::bad_words::BadWordRuleset;
use crate::types::config::message_filter::{HasBaseRule, MatchStrategy, MessageFilteringConfig, Modes, Pattern, RuleScope, ScopeMode};
use poise::serenity_prelude as serenity;
use rustrict::Censor;
use serenity::model::channel::Message;
use std::borrow::Cow;
use tracing::{debug, trace};

fn should_skip_scope(message: &Message, scope: &RuleScope) -> bool {
    let current_channel_id = message.channel_id;
    let is_channel_matched = scope.channels.contains(&current_channel_id.get());

    let has_matching_role = || -> bool {
        let Some(member) = &message.member else {
            return false;
        };
        member.roles.iter().any(|role_id| {
            scope.roles.contains(&role_id.get())
        })
    };

    match scope.mode {
        ScopeMode::Exempt => {
            if is_channel_matched {
                trace!("Skipping rule check: target channel is exempt");
                return true;
            }
            if has_matching_role() {
                trace!("Skipping rule check: user possesses an exempt role");
                return true;
            }
        }
        ScopeMode::Enforced => {
            if !is_channel_matched {
                trace!("Skipping rule check: target channel is not enforced");
                return true;
            }

            let role_enforced_but_missing = !scope.roles.is_empty() && !has_matching_role();
            if role_enforced_but_missing {
                trace!("Skipping rule check: user lacks required enforced role");
                return true;
            }
        }
    }

    false
}

fn should_be_skipped<T: HasBaseRule>(
    message: &Message,
    rule: &T,
) -> bool {
    should_skip_scope(message, &rule.base().scope)
}

fn should_be_skipped_ruleset(message: &Message, ruleset: &BadWordRuleset) -> bool {
    should_skip_scope(message, &ruleset.scope)
}

fn has_bad_words(pattern: &Pattern, original: &str, lower: &str) -> bool {
    match pattern.strategy {
        MatchStrategy::Exact => {
            let target = pattern.lowercase_value.get_or_init(|| pattern.value.to_lowercase());
            lower
                .split(|c: char| !c.is_alphanumeric())
                .any(|word| word == target)
        }
        MatchStrategy::Substring => {
            let target = pattern.lowercase_value.get_or_init(|| pattern.value.to_lowercase());
            lower.contains(target)
        }
        MatchStrategy::Regex => {
            let cached_regex = pattern.compiled_regex.get_or_init(|| {
                regex::RegexBuilder::new(&pattern.value)
                    .case_insensitive(true)
                    .build()
                    .ok()
            });
            cached_regex.as_ref().map_or(false, |re| re.is_match(original))
        }
    }
}

fn check_rule<'a, T: HasBaseRule>(
    rule_opt: Option<&'a T>,
    message: &Message,
) -> Option<&'a T> {
    let rule = rule_opt?;

    if !rule.base().enabled {
        return None;
    }

    if should_be_skipped(message, rule) {
        return None;
    }

    Some(rule)
}

pub fn filter_offensive_messages<'a>(
    message: &Message,
    filtering: &'a MessageFilteringConfig,
) -> FilterVerdict<'a> {
    let Some(offensive_rule) = check_rule(filtering.offensive_messages.as_ref(), message) else {
        return FilterVerdict::Pass;
    };

    trace!("Checking 'Offensive Messages' filter rule");
    let cleaned_content = utils::clean_message_content(&message.content);
    let analysis = Censor::from_str(&cleaned_content).analyze();

    let flag_threshold = offensive_rule.flag_threshold;
    if !analysis.is(flag_threshold.to_type()) {
        return FilterVerdict::Pass;
    }

    let categories = utils::get_rustrict_categories(&analysis);
    let trigger_content = if categories.is_empty() {
        None
    } else {
        Some(Cow::Owned(categories.join(", ")))
    };

    debug!(?categories, "Message flagged by Offensive Messages filter");
    FilterVerdict::Block {
        rule_name: "Offensive Message".into(),
        base_rule: Cow::Borrowed(&offensive_rule.base),
        trigger_content,
        custom_dm_message: None,
    }
}

pub fn filter_server_invites<'a>(
    message: &'a Message,
    filtering: &'a MessageFilteringConfig,
) -> FilterVerdict<'a> {
    let Some(server_invites) = check_rule(filtering.server_invites.as_ref(), message) else {
        return FilterVerdict::Pass;
    };

    trace!("Checking 'Server Invites' filter rule");
    if let Some(captures) = INVITE_REGEX.captures(&message.content) {
        let matched_link = captures.get(0).map(|m| Cow::Borrowed(m.as_str()));

        debug!(matched_link = ?matched_link, "Message flagged by Server Invites filter");
        return FilterVerdict::Block {
            rule_name: "Server Invites".into(),
            base_rule: Cow::Borrowed(server_invites.base()),
            trigger_content: matched_link,
            custom_dm_message: None,
        };
    }

    FilterVerdict::Pass
}

pub fn filter_external_urls<'a>(
    message: &'a Message,
    filtering: &'a MessageFilteringConfig,
) -> FilterVerdict<'a> {
    let Some(external_links) = check_rule(filtering.external_links.as_ref(), message) else {
        return FilterVerdict::Pass;
    };

    trace!("Checking 'External URLs' filter rule");
    let (_, urls) = utils::remove_urls(&message.content);
    if urls.is_empty() {
        return FilterVerdict::Pass;
    }

    if external_links.block_only_malicious {
        trace!("External URLs verification deferred for external API evaluation");
        return FilterVerdict::RequiresSafeBrowsingCheck {
            urls: urls.into_iter().map(String::from).collect(),
            external_links,
        };
    }

    let Some(url) = utils::any_breaking_rule_domain(external_links, &urls) else {
        return FilterVerdict::Pass;
    };

    // Restore dynamic rule name based on the mode configuration
    let rule_name = match external_links.mode {
        Modes::Allowlist => "External URLs (Not Allowed)",
        Modes::Denylist => "External URLs (Blocklisted)",
    };

    debug!(url, rule_name, "Message flagged by External URLs domain list filters");
    FilterVerdict::Block {
        rule_name: rule_name.into(),
        base_rule: Cow::Owned(external_links.base.clone()),
        trigger_content: Some(Cow::Borrowed(url)),
        custom_dm_message: None,
    }
}

pub fn filter_excessive_caps<'a>(
    message: &Message,
    filtering: &'a MessageFilteringConfig,
) -> FilterVerdict<'a> {
    let Some(excessive_caps) = check_rule(filtering.excessive_caps.as_ref(), message) else {
        return FilterVerdict::Pass;
    };

    trace!("Checking 'Excessive Caps' filter rule");
    if message.content.chars().count() < excessive_caps.min_length as usize { return FilterVerdict::Pass; }
    let count = utils::amount_of_uppercase(message.content.as_str());

    if excessive_caps.threshold >= count {
        return FilterVerdict::Pass;
    }

    debug!(caps_count = count, threshold = excessive_caps.threshold, "Message flagged by Excessive Caps filter");
    FilterVerdict::Block {
        rule_name: "Excessive Caps".into(),
        base_rule: Cow::Borrowed(&excessive_caps.base),
        trigger_content: None,
        custom_dm_message: None,
    }
}

pub fn filter_excessive_emojis<'a>(
    message: &Message,
    filtering: &'a MessageFilteringConfig,
) -> FilterVerdict<'a> {
    let Some(excessive_emojis) = check_rule(filtering.excessive_emojis.as_ref(), message) else {
        return FilterVerdict::Pass;
    };

    trace!("Checking 'Excessive Emojis' filter rule");
    let total_count = utils::count_emojis(&message.content) + DISCORD_EMOJI_REGEX.find_iter(&message.content).count();

    if total_count > excessive_emojis.max_emojis as usize {
        debug!(emoji_count = total_count, threshold = excessive_emojis.max_emojis, "Message flagged by Excessive Emojis filter");
        return FilterVerdict::Block {
            rule_name: "Excessive Emojis".into(),
            base_rule: Cow::Borrowed(&excessive_emojis.base),
            trigger_content: None,
            custom_dm_message: None,
        };
    }

    FilterVerdict::Pass
}

pub fn filter_excessive_spoilers<'a>(
    message: &Message,
    filtering: &'a MessageFilteringConfig,
) -> FilterVerdict<'a> {
    let Some(excessive_spoilers) = check_rule(filtering.excessive_spoilers.as_ref(), message) else {
        return FilterVerdict::Pass;
    };

    trace!("Checking 'Excessive Spoilers' filter rule");
    let amount = utils::calculate_spoiler_amount(&message.content);
    if amount > excessive_spoilers.threshold {
        debug!(spoiler_count = amount, threshold = excessive_spoilers.threshold, "Message flagged by Excessive Spoilers filter");
        return FilterVerdict::Block {
            rule_name: "Excessive Spoiler".into(),
            base_rule: Cow::Borrowed(&excessive_spoilers.base),
            trigger_content: None,
            custom_dm_message: None,
        };
    }

    FilterVerdict::Pass
}

pub fn filter_excessive_mentions<'a>(
    message: &Message,
    filtering: &'a MessageFilteringConfig,
) -> FilterVerdict<'a> {
    let Some(excessive_mentions) = check_rule(filtering.excessive_mentions.as_ref(), message) else {
        return FilterVerdict::Pass;
    };

    trace!("Checking 'Excessive Mentions' filter rule");
    let discord_count = DISCORD_PING_REGEX.find_iter(&message.content).count();
    if discord_count > excessive_mentions.max_mentions as usize {
        debug!(mention_count = discord_count, threshold = excessive_mentions.max_mentions, "Message flagged by Excessive Mentions filter");
        return FilterVerdict::Block {
            rule_name: "Excessive Mentions".into(),
            base_rule: Cow::Borrowed(&excessive_mentions.base),
            trigger_content: None,
            custom_dm_message: None,
        };
    }

    FilterVerdict::Pass
}

pub fn filter_zalgo<'a>(
    message: &Message,
    filtering: &'a MessageFilteringConfig,
) -> FilterVerdict<'a> {
    let Some(zalgo) = check_rule(filtering.zalgo.as_ref(), message) else {
        return FilterVerdict::Pass;
    };

    trace!("Checking 'Zalgo' filter rule");
    if utils::is_zalgo_grapheme(&message.content, 3) {
        debug!("Message flagged by Zalgo filter");
        return FilterVerdict::Block {
            rule_name: "Zalgo".into(),
            base_rule: Cow::Borrowed(&zalgo),
            trigger_content: None,
            custom_dm_message: None,
        };
    }

    FilterVerdict::Pass
}

/// Evaluates active, custom database-driven bad word rulesets
pub fn filter_bad_words<'a>(
    message: &Message,
    rulesets: &'a [BadWordRuleset],
) -> FilterVerdict<'a> {
    for ruleset in rulesets {
        if !ruleset.enabled {
            continue;
        }

        if should_be_skipped_ruleset(message, ruleset) {
            continue;
        }

        trace!(ruleset_name = %ruleset.name, "Checking custom database bad words ruleset");
        let content_lower = message.content.to_lowercase();
        let mut matched_pattern = None;

        for pattern in ruleset.patterns.iter() {
            if has_bad_words(pattern, &message.content, &content_lower) {
                matched_pattern = Some(pattern);
                break;
            }
        }

        if let Some(pattern) = matched_pattern {
            debug!(
                ruleset = %ruleset.name,
                trigger = %pattern.value,
                "Message flagged by dynamic Bad Words ruleset"
            );
            return FilterVerdict::Block {
                rule_name: Cow::Borrowed(&ruleset.name),
                base_rule: Cow::Owned(ruleset.to_base_rule()),
                trigger_content: Some(Cow::Borrowed(&pattern.value)),
                custom_dm_message: None,
            };
        }
    }

    FilterVerdict::Pass
}