use serenity::all::RuleId;

pub fn automod_rule_key(rule_id: RuleId) -> String {
    format!("automod_rule:{}", rule_id.get())
}

pub fn spam_record_key(guild_id: u64, user_id: u64) -> String {
    format!("spam:records:{guild_id}:{user_id}")
}

pub fn spam_warned_key(guild_id: u64, user_id: u64) -> String {
    format!("spam:warned:{guild_id}:{user_id}")
}
