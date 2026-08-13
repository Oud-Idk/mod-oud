use crate::core::config::state::{BotData, Error};
use crate::features::automod::FilterVerdict;
use crate::features::bad_words::rules::should_be_skipped_ruleset;
use crate::features::bad_words::types::BadWordRuleset;
use crate::features::bad_words::types::{MatchStrategy, Pattern};
use crate::features::bad_words::{cache, database, keys};
use fred::interfaces::{FredResult, KeysInterface};
use serenity::all::Message;
use std::borrow::Cow;
use std::sync::Arc;
use tracing::{debug, instrument, trace, warn};

fn has_bad_words(pattern: &Pattern, original: &str, lower: &str) -> bool {
    match pattern.strategy {
        MatchStrategy::Exact => {
            let target = pattern
                .lowercase_value
                .get_or_init(|| pattern.value.to_lowercase());
            lower
                .split(|c: char| !c.is_alphanumeric())
                .any(|word| word == target)
        }
        MatchStrategy::Substring => {
            let target = pattern
                .lowercase_value
                .get_or_init(|| pattern.value.to_lowercase());
            lower.contains(target)
        }
        MatchStrategy::Regex => {
            let cached_regex = pattern.compiled_regex.get_or_init(|| {
                regex::RegexBuilder::new(&pattern.value)
                    .case_insensitive(true)
                    .build()
                    .ok()
            });
            cached_regex
                .as_ref()
                .is_some_and(|re| re.is_match(original))
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

        for pattern in &ruleset.patterns {
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
    data: &BotData,
    guild_id: u64,
) -> Result<Arc<Vec<BadWordRuleset>>, Error> {
    // Check Moka Cache
    if let Some(rulesets) = data.caches.bad_words.get(&guild_id).await {
        trace!(guild_id, "Moka L1 Cache hit for bad word rulesets");
        return Ok(rulesets);
    }

    // Check Redis Cache / Fallback to PostgreSQL
    let cache_key = keys::bad_word_config_key(guild_id);
    let conn = &data.core.redis;

    let rulesets = match conn.get::<Option<String>, _>(&cache_key).await {
        Ok(Some(cached_str)) => match serde_json::from_str::<Vec<BadWordRuleset>>(&cached_str) {
            Ok(parsed) => {
                debug!(guild_id, "Redis L2 Cache hit for bad word rulesets");
                parsed
            }
            Err(_) => fetch_and_cache_from_db(data, guild_id, &cache_key).await?,
        },
        _ => fetch_and_cache_from_db(data, guild_id, &cache_key).await?,
    };

    let shared_rulesets = Arc::new(rulesets);

    // Populate Moka L1
    data.caches
        .bad_words
        .insert(guild_id, shared_rulesets.clone())
        .await;

    Ok(shared_rulesets)
}

/// Helper to fetch rows from Postgres L3 and write-through to Redis L2
async fn fetch_and_cache_from_db(
    data: &BotData,
    guild_id: u64,
    cache_key: &str,
) -> Result<Vec<BadWordRuleset>, Error> {
    let db_rows = database::fetch_bad_word_rows(&data.core.db, guild_id).await?;
    debug!(guild_id, "PostgreSQL L3 Fetch for bad word rulesets");

    if let Ok(serialized) = serde_json::to_string(&db_rows) {
        let _ = cache::cache_bad_word(cache_key, &data.core.redis, serialized).await;
    }

    Ok(db_rows)
}
