use crate::events::handlers::message_filter::utils;
use crate::events::handlers::message_filter::utils::{DISCORD_EMOJI_REGEX, DISCORD_PING_REGEX, INVITE_REGEX};
use crate::events::handlers::message_filter::verdict::FilterVerdict;
use crate::types::config::message_filter::{HasBaseRule, MatchStrategy, MessageFilteringConfig, Modes, Pattern, ScopeMode};
use poise::serenity_prelude as serenity;
use rustrict::Censor;
use serenity::model::channel::Message;
use std::borrow::Cow;

fn should_be_skipped<T: HasBaseRule>(
    message: &Message,
    rule: &T,
) -> bool {
    let base = rule.base();

    let current_channel_id = message.channel_id;
    let is_channel_matched = base.scope.channels.contains(&current_channel_id.get());

    let has_matching_role = || -> bool {
        let Some(member) = &message.member else {
            return false;
        };
        member.roles.iter().any(|role_id| {
            base.scope.roles.contains(&role_id.get())
        })
    };

    // 2. Short-circuit logic based on ScopeMode
    match base.scope.mode {
        ScopeMode::Exempt => {
            if is_channel_matched {
                return true;
            }
            if has_matching_role() {
                return true;
            }
        }
        ScopeMode::Enforced => {
            if !is_channel_matched {
                return true;
            }

            let role_enforced_but_missing = !base.scope.roles.is_empty() && !has_matching_role();
            if role_enforced_but_missing {
                return true;
            }
        }
    }

    false
}

fn has_bad_words(pattern: &Pattern, message: &Message) -> bool {
    let message_content_lower = message.content.to_lowercase();

    match pattern.strategy {
        MatchStrategy::Exact => {
            let target = pattern.value.to_lowercase();
            message_content_lower
                .split(|c: char| !c.is_alphanumeric())
                .any(|word| word == target)
        }
        MatchStrategy::Substring => {
            message_content_lower.contains(&pattern.value.to_lowercase())
        }
        MatchStrategy::Regex => {
            match regex::RegexBuilder::new(&pattern.value)
                .case_insensitive(true)
                .build()
            {
                Ok(re) => re.is_match(&message.content),
                Err(_) => false,
            }
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

pub fn filter_bad_words<'a>(
    message: &Message,
    filtering: &'a MessageFilteringConfig,
) -> FilterVerdict<'a> {
    let Some(bad_words) = check_rule(filtering.bad_words.as_ref(), message) else {
        return FilterVerdict::Pass;
    };

    let mut matched_pattern = None;

    for pattern in bad_words.patterns.iter() {
        let is_match = has_bad_words(pattern, &message);

        if is_match {
            matched_pattern = Some(pattern);
            break;
        }
    }

    if let Some(pattern) = matched_pattern {
        FilterVerdict::Block {
            rule_name: "Bad Words",
            base_rule: bad_words.base(),
            trigger_content: Some(Cow::Borrowed(&pattern.value)),
            custom_dm_message: None,
        }
    } else {
        FilterVerdict::Pass
    }
}

pub fn filter_offensive_messages<'a>(
    message: &Message,
    filtering: &'a MessageFilteringConfig,
) -> FilterVerdict<'a> {
    let Some(offensive_rule) = check_rule(filtering.offensive_messages.as_ref(), message) else {
        return FilterVerdict::Pass;
    };

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

    FilterVerdict::Block {
        rule_name: "Offensive Message",
        base_rule: &offensive_rule.base,
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

    if let Some(captures) = INVITE_REGEX.captures(&message.content) {
        let matched_link = captures.get(0).map(|m| Cow::Borrowed(m.as_str()));

        return FilterVerdict::Block {
            rule_name: "Server Invites",
            base_rule: server_invites.base(),
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

    let (_, urls) = utils::remove_urls(&message.content);
    if urls.is_empty() {
        return FilterVerdict::Pass;
    }

    if external_links.block_only_malicious {
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

    FilterVerdict::Block {
        rule_name,
        base_rule: &external_links.base,
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

    if message.content.chars().count() < excessive_caps.min_length as usize { return FilterVerdict::Pass; }
    let count = utils::amount_of_uppercase(message.content.as_str());

    if excessive_caps.threshold >= count {
        return FilterVerdict::Pass;
    }

    FilterVerdict::Block {
        rule_name: "Excessive Caps",
        base_rule: &excessive_caps.base,
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

    let total_count = utils::count_emojis(&message.content) + DISCORD_EMOJI_REGEX.find_iter(&message.content).count();

    if total_count > excessive_emojis.max_emojis as usize {
        return FilterVerdict::Block {
            rule_name: "Excessive Emojis",
            base_rule: &excessive_emojis.base,
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

    let amount = utils::calculate_spoiler_amount(&message.content);
    if amount > excessive_spoilers.threshold {
        return FilterVerdict::Block {
            rule_name: "Excessive Spoiler",
            base_rule: &excessive_spoilers.base,
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

    let discord_count = DISCORD_PING_REGEX.find_iter(&message.content).count();
    if discord_count > excessive_mentions.max_mentions as usize {
        return FilterVerdict::Block {
            rule_name: "Excessive Mentions",
            base_rule: &excessive_mentions.base,
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

    if utils::is_zalgo_grapheme(&message.content, 3) {
        return FilterVerdict::Block {
            rule_name: "Zalgo",
            base_rule: &zalgo,
            trigger_content: None,
            custom_dm_message: None,
        };
    }

    FilterVerdict::Pass
}