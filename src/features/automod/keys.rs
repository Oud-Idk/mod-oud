use serenity::all::{GuildId, RuleId, UserId};

/// Generates the Redis cache key for storing an automod rule definition.
#[must_use]
pub fn automod_rule_key(rule_id: RuleId) -> String {
    format!("automod_rule:{rule_id}")
}

/// Generates the Redis key for tracking message timestamps in a user's sliding spam window.
#[must_use]
pub fn spam_record_key(guild_id: GuildId, user_id: UserId) -> String {
    format!("spam:records:{guild_id}:{user_id}")
}

/// Generates the Redis key used as a cooldown lock to throttle spam warning alerts.
#[must_use]
pub fn spam_warned_key(guild_id: GuildId, user_id: UserId) -> String {
    format!("spam:warned:{guild_id}:{user_id}")
}
