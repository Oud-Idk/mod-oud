use serenity::all::GuildId;

/// Claim marker for a guild's member counter update. Held for one update
/// interval; its existence means "already updated within the interval" and
/// doubles as the cross-instance lock for the next update.
pub fn update_claim_key(guild_id: GuildId) -> String {
    format!("member_counter:update_claim:{guild_id}")
}
