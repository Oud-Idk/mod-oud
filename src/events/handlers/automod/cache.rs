use fred::clients::Client;
use fred::interfaces::{FredResult, KeysInterface};
use fred::prelude::Expiration;
use serenity::all::{Rule, RuleId};

pub async fn cache_automod_name(redis: &Client, rule_id: &RuleId, rule: &Rule) -> FredResult<()> {
    let redis_key = format!("automod_rule:{}", rule_id.get());

    redis.set(
        redis_key,
        &rule.name,
        Some(Expiration::EX(86400)),
        None,
        false
    ).await
}

pub async fn get_rule_name_from_cache(redis: &Client, rule_id: &RuleId) -> FredResult<Option<String>> {
    let redis_key = format!("automod_rule:{}", rule_id.get());
    redis.get::<Option<String>, _>(&redis_key).await
}

pub async fn invalidate_rule_cache(
    redis: &Client,
    rule_id: &RuleId,
) -> FredResult<()> {
    let redis_key = format!("automod_rule:{}", rule_id.get());
    redis.del::<(), _>(&redis_key).await?;

    Ok(())
}