use crate::features::automod::keys;
use anyhow::Result;
use fred::clients::{Client, Transaction};
use fred::interfaces::{FredResult, KeysInterface, SortedSetsInterface, TransactionInterface};
use fred::prelude::{Expiration, SetOptions};
use fred::types::ExpireOptions;
use fred::types::sorted_sets::Ordering;
use serenity::all::{Context, GuildId, Rule, RuleId};
use std::time::Duration;

/// Caches an `AutoMod` rule name in Redis with a 24-hour expiration time.
///
/// # Errors
/// Returns `Err` if Redis fails to set the key
pub async fn cache_automod_name(redis: &Client, rule_id: RuleId, rule: &Rule) -> FredResult<()> {
    let redis_key = keys::automod_rule_key(rule_id);

    redis
        .set(
            redis_key,
            &rule.name,
            Some(Expiration::EX(86400)),
            None,
            false,
        )
        .await
}

/// Retrieves a cached `AutoMod` rule name from Redis by its [`RuleId`].
pub async fn get_rule_name_from_cache(
    redis: &Client,
    rule_id: RuleId,
) -> FredResult<Option<String>> {
    let redis_key = keys::automod_rule_key(rule_id);
    redis.get::<Option<String>, _>(&redis_key).await
}

/// Invalidates (deletes) a cached `AutoMod` rule name from Redis.
///
/// # Errors
/// Returns `Err` if Redis fails to delete the key
pub async fn invalidate_rule_cache(redis: &Client, rule_id: RuleId) -> FredResult<()> {
    let redis_key = keys::automod_rule_key(rule_id);
    redis.del(&redis_key).await
}

/// Resolves the name of an `AutoMod` rule.
///
/// Checks the Redis cache first. If missing, it fetches the rule from the Discord HTTP API,
/// caches the result, and returns the name. Falls back to a formatted Rule ID string on failure.
pub async fn get_rule_name(
    ctx: &Context,
    redis: &Client,
    guild_id: &GuildId,
    rule_id: RuleId,
) -> String {
    if let Ok(Some(cached_name)) = get_rule_name_from_cache(redis, rule_id).await {
        return cached_name;
    }

    match guild_id.automod_rule(&ctx.http, rule_id).await {
        Ok(rule) => {
            let _ = cache_automod_name(redis, rule_id, &rule).await;
            rule.name
        }
        Err(_) => {
            format!("Rule ID: {}", rule_id.get())
        }
    }
}

/// Records a user event in a Redis sliding-window sorted set and returns the event count within the window.
///
/// # Arguments
/// * `window` - The sliding window duration to retain records.
/// * `key` - Redis key for the user/guild sliding window sorted set.
/// * `now` - Current UNIX timestamp score.
/// * `clear_before` - Cutoff timestamp score for removing expired records.
/// * `member` - User/member string identifier to append to the sorted set.
/// * `redis_multi_tx` - Initialized Redis transaction client.
pub async fn store_spam_record(
    window: Duration,
    key: &str,
    now: f64,
    clear_before: f64,
    member: &str,
    redis_multi_tx: Transaction,
) -> Result<usize> {
    let _: () = redis_multi_tx
        .zremrangebyscore(key, "-inf", clear_before)
        .await?;
    let _: () = redis_multi_tx
        .zadd(
            key,
            None::<SetOptions>,
            None::<Ordering>,
            false,
            false,
            (now, member),
        )
        .await?;
    let _: () = redis_multi_tx.zcard(key).await?;
    let _: () = redis_multi_tx
        .expire(
            key,
            i64::try_from(window.as_secs().saturating_add(1)).unwrap_or(i64::MAX),
            None::<ExpireOptions>,
        )
        .await?;

    let (_, _, count, _): (usize, usize, usize, usize) = redis_multi_tx.exec(true).await?;
    Ok(count)
}

/// Starts a new Redis `MULTI` transaction for recording spam events.
pub fn begin_spam_transaction(redis: &Client) -> Transaction {
    redis.multi()
}

/// Sets a Redis cooldown lock, returning `true` if the lock was newly acquired
/// (i.e. the cooldown had elapsed) and `false` if the key already existed.
///
/// # Errors
/// Returns `Err` if Redis fails to set the key.
pub async fn set_warning_cooldown(redis: &Client, key: &str, cooldown_millis: i64) -> Result<bool> {
    let set_result: Option<String> = redis
        .set(
            key,
            "1",
            Some(Expiration::PX(cooldown_millis)),
            Some(SetOptions::NX),
            false,
        )
        .await?;

    Ok(set_result.is_some())
}
