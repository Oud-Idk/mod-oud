use crate::types::config::bad_words::BadWordRuleset;
use crate::types::config::message_filter::{Pattern, RuleAction, RuleScope};
use crate::types::{Data, Error};
use fred::interfaces::FredResult;
use fred::prelude::KeysInterface;
use fred::types::Expiration;
use tracing::{debug, instrument, warn};

/// Inserts a formal warning into the database and returns the generated warning ID.
pub async fn insert_warning(
    db: &sqlx::PgPool,
    guild_id: i64,
    user_id: i64,
    moderator_id: i64,
    reason: &str,
) -> Result<Option<i32>, sqlx::Error> {
    let row = sqlx::query!(
        r#"
        INSERT INTO warns (guild_id, user_id, moderator_id, reason)
        VALUES ($1, $2, $3, $4)
        RETURNING id
        "#,
        guild_id,
        user_id,
        moderator_id,
        reason,
    )
        .fetch_optional(db)
        .await?;

    Ok(row.map(|r| r.id))
}

/// Logs an automod action execution event to the database.
pub async fn insert_automod_log<'a>(
    db: &sqlx::PgPool,
    guild_id: i64,
    user_id: i64,
    channel_id: Option<i64>,
    message_id: Option<i64>,
    rule_name: &str,
    trigger_content: Option<&str>,
    original_content: Option<&str>,
    actions_taken: &[&'a str],
    username: &str,
) -> Result<(), sqlx::Error> {
    let actions_vec: Vec<String> = actions_taken
        .iter()
        .map(|&action| action.to_string())
        .collect();

    sqlx::query!(
        r#"
        INSERT INTO automod_logs (guild_id, user_id, channel_id, message_id, rule_type, trigger_content, original_content, actions_taken, username)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        "#,
        guild_id.to_string(),
        user_id.to_string(),
        channel_id.map(|v| v.to_string()),
        message_id.map(|v| v.to_string()),
        rule_name,
        trigger_content,
        original_content,
        &actions_vec,
        username,
    )
        .execute(db)
        .await?;

    Ok(())
}

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
        guild_id.to_string(),
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

    debug!(cache_key = %cache_key, "Checking Redis cache for bad word rulesets");

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

    debug!("Fetching bad word rulesets from database");
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