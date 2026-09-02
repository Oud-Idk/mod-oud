use crate::core::config::state::{BotData, Error};
use crate::features::automod::FilterVerdict;
use crate::features::bad_words::rules::should_be_skipped_ruleset;
use crate::features::bad_words::types::{BadWordRuleset, CompiledRuleset, MatchStrategy};
use crate::features::bad_words::{cache, database, keys};
use futures::FutureExt as _;
use serenity::all::Message;
use serenity::model::id::GuildId;
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

        if let Some(verdict) = check_ruleset(&mut ctx, ruleset) {
            return verdict;
        }
    }

    FilterVerdict::Pass
}

/// Runs all pattern strategies for a single ruleset against the message content.
fn check_ruleset<'a>(
    ctx: &mut MessageContext<'_>,
    ruleset: &'a CompiledRuleset,
) -> Option<FilterVerdict<'a>> {
    if let Some((matcher, patterns)) = &ruleset.text_matcher {
        let lower = ctx.lower();

        // Use find_overlapping_iter so a rejected Exact match doesn't
        // swallow or skip overlapping valid matches
        for mat in matcher.find_overlapping_iter(lower) {
            let pattern_info = &patterns[mat.pattern().as_usize()];

            match pattern_info.strategy {
                MatchStrategy::Substring => {
                    // Substring matches unconditionally!
                    return Some(block_verdict(ruleset, &pattern_info.original));
                }
                MatchStrategy::Exact => {
                    let start = mat.start();
                    let end = mat.end();

                    let left_ok = start == 0
                        || !lower[..start]
                        .chars()
                        .next_back()
                        .unwrap()
                        .is_alphanumeric();
                    let right_ok = end == lower.len()
                        || !lower[end..].chars().next().unwrap().is_alphanumeric();

                    if left_ok && right_ok {
                        return Some(block_verdict(ruleset, &pattern_info.original));
                    }
                }
                MatchStrategy::Regex => unreachable!("Regex are evaluated later"),
            }
        }
    }

    // Regex Check
    for (re, raw_pattern) in &ruleset.regexes {
        if re.is_match(ctx.original) {
            return Some(block_verdict(ruleset, raw_pattern));
        }
    }

    None
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
    guild_id: GuildId,
) -> Result<Arc<Vec<CompiledRuleset>>, Error> {
    data.caches
        .bad_words
        .try_get_with(guild_id, async {
            let cache_key = keys::bad_word_config_key(guild_id);
            let conn = &data.core.redis;

            let raw_rulesets = match cache::get_cached_bad_words(conn, &cache_key).await {
                Some(cached_str) => {
                    match serde_json::from_str::<Vec<BadWordRuleset>>(&cached_str) {
                        Ok(parsed) => {
                            debug!(%guild_id, "Redis L2 Cache hit for bad word rulesets");
                            parsed
                        }
                        Err(_) => fetch_and_cache_from_db(data, guild_id, &cache_key).await?,
                    }
                }
                None => fetch_and_cache_from_db(data, guild_id, &cache_key).await?,
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
    guild_id: GuildId,
    cache_key: &str,
) -> Result<Vec<BadWordRuleset>, Error> {
    let db_rows = database::fetch_bad_word_rows(&data.core.db, guild_id).await?;
    debug!(%guild_id, "PostgreSQL Fetch for bad word rulesets");

    if let Ok(serialized) = serde_json::to_string(&db_rows) {
        let _ = cache::cache_bad_word(cache_key, &data.core.redis, serialized).await;
    }

    Ok(db_rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::automod::{FilterVerdict, RuleAction, RuleScope};
    use crate::features::bad_words::types::Pattern;
    use serenity::all::GuildId;
    use std::borrow::Cow;

    /// Helper to construct a `CompiledRuleset` from a list of (`strategy`, `pattern_str`) pairs
    fn ruleset_with(patterns: &[(MatchStrategy, &str)]) -> CompiledRuleset {
        BadWordRuleset {
            id: uuid::Uuid::nil(),
            guild_id: GuildId::new(1),
            name: "test".to_string(),
            enabled: true,
            patterns: patterns
                .iter()
                .map(|(strategy, val)| Pattern {
                    strategy: *strategy,
                    value: (*val).to_string(),
                })
                .collect(),
            actions: Vec::<RuleAction>::new(),
            timeout_duration_seconds: None,
            scope: RuleScope::default(),
        }
            .into()
    }

    fn trigger_of(verdict: Option<FilterVerdict<'_>>) -> Option<String> {
        match verdict {
            Some(FilterVerdict::Block {
                trigger_content, ..
            }) => trigger_content.map(Cow::into_owned),
            _ => None,
        }
    }

    #[test]
    fn exact_phrase_matches_case_insensitive_and_surrounding_punctuation() {
        let ruleset = ruleset_with(&[(MatchStrategy::Exact, "guaranteed returns")]);
        let mut ctx = MessageContext::new("Get GUARANTEED RETURNS now!!");

        let trigger = trigger_of(check_ruleset(&mut ctx, &ruleset));

        assert_eq!(trigger.as_deref(), Some("guaranteed returns"));
    }

    #[test]
    fn exact_phrase_requires_word_boundaries() {
        let ruleset = ruleset_with(&[(MatchStrategy::Exact, "guaranteed returns")]);

        // Prefix boundary violation
        let mut ctx = MessageContext::new("unguaranteed returns");
        assert!(check_ruleset(&mut ctx, &ruleset).is_none());

        // Incomplete phrase
        let mut ctx = MessageContext::new("guaranteed");
        assert!(check_ruleset(&mut ctx, &ruleset).is_none());

        // Broken phrase
        let mut ctx = MessageContext::new("guaranteed no returns");
        assert!(check_ruleset(&mut ctx, &ruleset).is_none());
    }

    #[test]
    fn single_exact_word_matches_with_punctuation_boundaries() {
        let ruleset = ruleset_with(&[(MatchStrategy::Exact, "scam")]);
        let mut ctx = MessageContext::new("what a total !!SCAM??");

        let trigger = trigger_of(check_ruleset(&mut ctx, &ruleset));

        assert_eq!(trigger.as_deref(), Some("scam"));
    }

    #[test]
    fn single_exact_word_respects_boundaries() {
        let ruleset = ruleset_with(&[(MatchStrategy::Exact, "scam")]);

        // Embedded inside other words -> ignored by Exact strategy
        let mut ctx = MessageContext::new("noscamming here");
        assert!(check_ruleset(&mut ctx, &ruleset).is_none());
    }

    #[test]
    fn substring_strategy_matches_inside_words() {
        let ruleset = ruleset_with(&[(MatchStrategy::Substring, "scam")]);

        // Substring strategy SHOULD trigger even embedded inside words
        let mut ctx = MessageContext::new("noscamming here");
        let trigger = trigger_of(check_ruleset(&mut ctx, &ruleset));

        assert_eq!(trigger.as_deref(), Some("scam"));
    }
}
