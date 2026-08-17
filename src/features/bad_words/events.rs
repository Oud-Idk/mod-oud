use crate::core::config::state::{BotData, Error};
use crate::features::automod::FilterVerdict;
use crate::features::bad_words::rules::should_be_skipped_ruleset;
use crate::features::bad_words::types::{BadWordRuleset, CompiledRuleset};
use crate::features::bad_words::{cache, database, keys};
use fred::interfaces::KeysInterface;
use futures::FutureExt as _;
use serenity::all::Message;
use std::borrow::Cow;
use std::sync::Arc;
use tracing::{debug, trace};

/// Lazy container so we don't lowercase or allocate strings unless a rule needs it
struct MessageContext<'a> {
    original: &'a str,
    lower: Option<String>,
}

impl<'a> MessageContext<'a> {
    const fn new(original: &'a str) -> Self {
        Self {
            original,
            lower: None,
        }
    }

    fn lower(&mut self) -> &str {
        self.lower
            .get_or_insert_with(|| self.original.to_lowercase())
    }
}

/// Evaluates active, custom database-driven bad word rulesets
pub fn filter_bad_words<'a>(
    message: &Message,
    rulesets: &'a [CompiledRuleset],
) -> FilterVerdict<'a> {
    let mut ctx = MessageContext::new(&message.content);

    for ruleset in rulesets {
        if !ruleset.enabled || should_be_skipped_ruleset(message, ruleset) {
            continue;
        }

        trace!(ruleset_name = %ruleset.name, "Checking custom database bad words ruleset");

        // Exact Match Check: O(1) hash lookup per word token in message
        if !ruleset.exact_words.is_empty() {
            let lower = ctx.lower();
            let matched_exact = lower
                .split(|c: char| !c.is_alphanumeric())
                .find(|token| !token.is_empty() && ruleset.exact_words.contains(*token));

            if let Some(trigger) = matched_exact {
                return block_verdict(ruleset, trigger);
            }
        }

        // Substring Match Check: O(L) single-pass scan across all substrings
        if let Some((matcher, original_patterns)) = &ruleset.substring_matcher {
            let lower = ctx.lower();
            if let Some(mat) = matcher.find(lower) {
                let trigger = &original_patterns[mat.pattern().as_usize()];
                return block_verdict(ruleset, trigger);
            }
        }

        // Regex Check
        for (re, raw_pattern) in &ruleset.regexes {
            if re.is_match(ctx.original) {
                return block_verdict(ruleset, raw_pattern);
            }
        }
    }

    FilterVerdict::Pass
}

#[inline]
fn block_verdict<'a>(ruleset: &'a CompiledRuleset, trigger: &str) -> FilterVerdict<'a> {
    debug!(
        ruleset = %ruleset.name,
        trigger = %trigger,
        "Message flagged by dynamic Bad Words ruleset"
    );
    FilterVerdict::Block {
        rule_name: Cow::Borrowed(&ruleset.name),
        base_rule: Cow::Owned(ruleset.to_base_rule()),
        trigger_content: Some(Cow::Owned(trigger.to_string())),
        custom_dm_message: None,
    }
}

/// Fetch active rulesets using Moka L1 -> Redis L2 -> Postgres L3
///
/// # Errors
/// Returns an [`Error`] if:
/// - A cache miss occurs (or Redis contains invalid/corrupted data) and querying `PostgreSQL` fails.
/// - The concurrent cache loader task fails, panics, or gets cancelled across threads.
///
/// Transient Redis read/write failures do not return an error directly.
pub async fn get_active_bad_word_rulesets(
    data: &BotData,
    guild_id: u64,
) -> Result<Arc<Vec<CompiledRuleset>>, Error> {
    data.caches
        .bad_words
        .try_get_with(guild_id, async {
            let cache_key = keys::bad_word_config_key(guild_id);
            let conn = &data.core.redis;

            let raw_rulesets = match conn.get::<Option<String>, _>(&cache_key).await {
                Ok(Some(cached_str)) => {
                    match serde_json::from_str::<Vec<BadWordRuleset>>(&cached_str) {
                        Ok(parsed) => {
                            debug!(guild_id, "Redis L2 Cache hit for bad word rulesets");
                            parsed
                        }
                        Err(_) => fetch_and_cache_from_db(data, guild_id, &cache_key).await?,
                    }
                }
                _ => fetch_and_cache_from_db(data, guild_id, &cache_key).await?,
            };

            // Compile immediately upon loading into memory
            let compiled: Vec<CompiledRuleset> = raw_rulesets
                .into_iter()
                .map(CompiledRuleset::from)
                .collect();

            // Explicitly annotate Error type for the async block
            Ok::<Arc<Vec<CompiledRuleset>>, Error>(Arc::new(compiled))
        })
        .boxed()
        .await
        .map_err(|arc_err| {
            // Unwraps the inner Error or formats it if shared across threads
            match Arc::try_unwrap(arc_err) {
                Ok(err) => err,
                Err(arc) => anyhow::anyhow!("{arc}"),
            }
        })
}

/// Helper to fetch rows from Postgres L3 and write-through to Redis L2
async fn fetch_and_cache_from_db(
    data: &BotData,
    guild_id: u64,
    cache_key: &str,
) -> Result<Vec<BadWordRuleset>, Error> {
    let db_rows = database::fetch_bad_word_rows(&data.core.db, guild_id).await?;
    debug!(guild_id, "PostgreSQL Fetch for bad word rulesets");

    if let Ok(serialized) = serde_json::to_string(&db_rows) {
        let _ = cache::cache_bad_word(cache_key, &data.core.redis, serialized).await;
    }

    Ok(db_rows)
}
