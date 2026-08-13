use uuid::Uuid;

pub fn recent_join_hash_key(guild_id: u64) -> String {
    format!("guild:{guild_id}:recent_joins")
}

pub fn hourly_stats_hash_key(guild_id: u64) -> String {
    format!("guild:{guild_id}:hourly_stats")
}

pub fn stats_cache_key(guild_id: u64) -> String {
    format!("guild:{guild_id}:stats_cache")
}

pub fn lock_key(stats_cache_key: &str) -> String {
    format!("{stats_cache_key}:lock")
}

pub fn member_key(user_id: u64, now_ts: i64) -> String {
    let nonce = &Uuid::new_v4().simple().to_string()[..8];
    format!("{user_id}:{now_ts}:{nonce}")
}

pub fn raid_snapshot_key(guild_id: u64) -> String {
    format!("raid_snapshot:{guild_id}")
}

pub fn raid_active_key(guild_id: u64) -> String {
    format!("raid_active:{guild_id}")
}

pub const fn active_raids_key<'a>() -> &'a str {
    "active_raids"
}