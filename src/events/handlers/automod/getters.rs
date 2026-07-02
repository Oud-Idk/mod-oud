use crate::events::handlers::automod::cache;
use crate::events::handlers::automod::cache::get_rule_name_from_cache;
use fred::clients::Client;
use serenity::all::{Context, GuildId, RuleId};

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
            let _: Result<(), _> = cache::cache_automod_name(redis, &rule_id, &rule).await;

            rule.name
        }
        Err(_) => {
            format!("Rule ID: {}", rule_id.get())
        }
    };

    rule_name
}

