use crate::features::automod::FilterVerdict;
use crate::features::bad_words::rules::should_be_skipped_ruleset;
use crate::features::bad_words::types::BadWordRuleset;
use crate::features::bad_words::types::{MatchStrategy, Pattern};
use crate::features::bad_words::{cache, database, keys};
use crate::{Data, Error};
use fred::interfaces::{FredResult, KeysInterface};
use serenity::all::Message;
use std::borrow::Cow;
use tracing::{debug, instrument, trace, warn};

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

/// Fetch active rulesets using a Redis cache layer fallback
#[instrument(skip(data), fields(guild_id = guild_id))]
pub async fn get_active_bad_word_rulesets(
    data: &Data,
    guild_id: i64,
) -> Result<Vec<BadWordRuleset>, Error> {
    let cache_key = keys::bad_word_config_key(guild_id);
    let conn = &data.redis;

    trace!(cache_key = %cache_key, "Checking Redis cache for bad word rulesets");

    let res: FredResult<String> = conn.get(&cache_key).await;
    match res {
        Ok(cached) => {
            match serde_json::from_str::<Vec<BadWordRuleset>>(&cached) {
                Ok(rulesets) => {
                    debug!(rulesets_count = rulesets.len(), "Cache hit; returned bad word rulesets");
                    return Ok(rulesets);
                }
                Err(err) => {
                    warn!(error = %err, "Failed to deserialize cached rulesets; falling back to DB");
                }
            }
        }
        Err(err) => {
            debug!(error = %err, "Cache miss or Redis read error; falling back to DB");
        }
    }

    let rulesets = database::fetch_bad_word_rows(&data.db, guild_id).await?;
    debug!(rulesets_count = rulesets.len(), "Successfully fetched bad word rulesets from database");

    match serde_json::to_string(&rulesets) {
        Ok(serialized) => {
            debug!("Writing rulesets to Redis cache");
            let set_result: Result<(), _> = cache::cache_bad_word(&cache_key, conn, serialized).await;

            if let Err(err) = set_result {
                warn!(error = %err, "Failed to write rulesets to Redis cache");
            } else {
                debug!("Successfully updated Redis cache");
            }
        }
        Err(err) => {
            warn!(error = %err, "Failed to serialize rulesets for caching");
        }
    }

    Ok(rulesets)
}