use std::borrow::Cow;
use serenity::all::Message;
use tracing::{debug, trace};
use crate::features::automod::FilterVerdict;
use crate::features::bad_words::rules::should_be_skipped_ruleset;
use crate::features::bad_words::types::{MatchStrategy, Pattern};
use crate::features::bad_words::types::BadWordRuleset;

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
