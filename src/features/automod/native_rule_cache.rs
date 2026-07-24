use fred::clients::Client;
use serenity::all::{Context, GuildId, Rule, RuleId};
use fred::interfaces::{FredResult, KeysInterface};
use fred::prelude::Expiration;

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