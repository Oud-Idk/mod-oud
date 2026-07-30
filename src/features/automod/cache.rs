use crate::features::automod::keys;
use fred::clients::{Client, Transaction};
use fred::error::Error;
use fred::interfaces::{FredResult, KeysInterface, SortedSetsInterface};
use fred::prelude::{Expiration, SetOptions};
use fred::types::ExpireOptions;
use fred::types::sorted_sets::Ordering;
use serenity::all::{Context, GuildId, Rule, RuleId};
use std::time::Duration;

pub async fn cache_automod_name(redis: &Client, rule_id: &RuleId, rule: &Rule) -> FredResult<()> {
    let redis_key = keys::automod_rule_key(rule_id);

    redis.set(
        redis_key,
        &rule.name,
        Some(Expiration::EX(86400)),
        None,
        false
    ).await
}

pub async fn get_rule_name_from_cache(redis: &Client, rule_id: &RuleId) -> FredResult<Option<String>> {
    let redis_key = keys::automod_rule_key(rule_id);
    redis.get::<Option<String>, _>(&redis_key).await
}

pub async fn invalidate_rule_cache(
    redis: &Client,
    rule_id: &RuleId,
) -> FredResult<()> {
    let redis_key = keys::automod_rule_key(rule_id);
    redis.del::<(), _>(&redis_key).await?;

    Ok(())
}

pub async fn get_rule_name(
    ctx: &Context,
    redis: &Client,
    guild_id: &GuildId,
    rule_id: &RuleId,
) -> String {
    if let Ok(Some(cached_name)) = get_rule_name_from_cache(&redis, &rule_id).await {
        return cached_name;
    }

    let rule_name = match guild_id.automod_rule(&ctx.http, rule_id).await {
        Ok(rule) => {
            let _: Result<(), _> = cache_automod_name(redis, &rule_id, &rule).await;

            rule.name
        }
        Err(_) => {
            format!("Rule ID: {}", rule_id.get())
        }
    };

    rule_name
}

pub async fn store_spam_record(window: Duration, key: &String, now: f64, clear_before: f64, member: String, tx: Transaction) -> Result<usize, Error> {
    let _: () = tx.zremrangebyscore(key, "-inf", clear_before).await?;
    let _: () = tx.zadd(
        key,
        None::<SetOptions>,
        None::<Ordering>,
        false,
        false,
        (now, member)
    ).await?;
    let _: () = tx.zcard(key).await?;
    let _: () = tx.expire(
        key,
        (window.as_secs() + 1) as i64,
        None::<ExpireOptions>
    ).await?;

    let (_, _, count, _): (usize, usize, usize, usize) = tx.exec(true).await?;
    Ok(count)
}