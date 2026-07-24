use crate::features::automod::{RuleAction, RuleScope};
use crate::features::bad_words::types::BadWordRuleset;
use crate::features::bad_words::types::Pattern;
use crate::{Data, Error};
use fred::interfaces::{FredResult, KeysInterface};
use fred::prelude::Expiration;
use tracing::{debug, instrument, trace, warn};
/// Fetch active rulesets directly from the database
pub async fn get_bad_word_rulesets(
    db: &sqlx::PgPool,
    guild_id: i64,
) -> Result<Vec<BadWordRuleset>, sqlx::Error> {
    let rows = sqlx::query!(
        r#"
        SELECT id, guild_id, name, enabled, patterns, actions, timeout_duration_seconds, scope
        FROM bad_word_rulesets
        WHERE guild_id = $1 AND enabled = true
        "#,
        guild_id,
    )
        .fetch_all(db)
        .await?;

    let rulesets = rows
        .into_iter()
        .map(|r| {
            let patterns: Vec<Pattern> = serde_json::from_value(r.patterns).unwrap_or_default();
            let actions: Vec<RuleAction> = serde_json::from_value(r.actions).unwrap_or_default();
            let scope: RuleScope = serde_json::from_value(r.scope).unwrap_or_default();

            BadWordRuleset {
                id: r.id,
                guild_id: r.guild_id,
                name: r.name,
                enabled: r.enabled,
                patterns,
                actions,
                timeout_duration_seconds: r.timeout_duration_seconds,
                scope,
            }
        })
        .collect();

    Ok(rulesets)
}

/// Fetch active rulesets using a Redis cache layer fallback
#[instrument(skip(data), fields(guild_id = guild_id))]
pub async fn get_active_bad_word_rulesets(
    data: &Data,
    guild_id: i64,
) -> Result<Vec<BadWordRuleset>, Error> {
    let cache_key = format!("config:guild:{}:bad_words", guild_id);
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

    let rulesets = get_bad_word_rulesets(&data.db, guild_id).await?;
    debug!(rulesets_count = rulesets.len(), "Successfully fetched bad word rulesets from database");

    match serde_json::to_string(&rulesets) {
        Ok(serialized) => {
            debug!("Writing rulesets to Redis cache");
            let set_result: Result<(), _> = conn.set(&cache_key, serialized, Some(Expiration::EX(3600)), None, false).await;

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