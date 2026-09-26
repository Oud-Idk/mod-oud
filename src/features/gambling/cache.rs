use crate::core::config::state::Context;
use crate::features::gambling::keys::gambling_cooldown_key;
use crate::features::gambling::types::GamblingConfig;
use fred::interfaces::KeysInterface;
use fred::prelude::{Expiration, SetOptions};
use humantime::format_duration;
use std::time::Duration;
use tracing::{error, warn};

/// Shown when the cooldown cannot be read, so the player is not actually on cooldown.
const COOLDOWN_UNAVAILABLE_MESSAGE: &str =
    "Cooldowns are temporarily unavailable. Please try again in a moment.";

/// Try to acquire the global gambling cooldown for this user.
///
/// * Returns `None` when no cooldown is configured or acquisition succeeded (ready to play).
/// * Returns `Some(wait_msg)` when the user is on cooldown, or when Redis is unreachable.
///
/// A Redis failure still returns `Some` so no bet goes unthrottled, but the message says the
/// service is down rather than claiming a cooldown.
pub async fn try_acquire_gambling_cooldown(
    ctx: &Context<'_>,
    config: &GamblingConfig,
) -> Option<String> {
    let secs = config.cooldown_secs.max(0);
    if secs == 0 {
        return None;
    }

    let guild_id = ctx.guild_id()?;
    let user_id = ctx.author().id;
    let redis = &ctx.data().core.redis;
    let key = gambling_cooldown_key(guild_id, user_id);

    let set_result = redis
        .set(
            &key,
            "1",
            Some(Expiration::EX(secs)),
            Some(SetOptions::NX),
            false,
        )
        .await;

    let acquired: Option<String> = match set_result {
        Ok(acquired) => acquired,
        Err(e) => {
            error!(
                error = ?e,
                cooldown_key = %key,
                cooldown_secs = secs,
                %guild_id,
                %user_id,
                "Gambling cooldown SET failed; failing closed"
            );
            return Some(COOLDOWN_UNAVAILABLE_MESSAGE.to_string());
        }
    };

    if acquired.is_some() {
        return None;
    }

    // `Ok(None)` from SET NX means the key exists, so this is a real cooldown.
    let remaining = match redis.ttl::<i64, _>(&key).await {
        Ok(remaining) => remaining,
        Err(e) => {
            warn!(
                error = ?e,
                cooldown_key = %key,
                %guild_id,
                %user_id,
                "Gambling cooldown TTL lookup failed; remaining time unknown"
            );
            return Some(COOLDOWN_UNAVAILABLE_MESSAGE.to_string());
        }
    };

    #[allow(clippy::cast_sign_loss)]
    let wait_secs = remaining.max(0) as u64;
    let wait_time = format_duration(Duration::from_secs(wait_secs));
    Some(format!("You're on cooldown. Try again in {wait_time}."))
}

/// Release a previously-acquired cooldown.
pub async fn release_gambling_cooldown(ctx: &Context<'_>) {
    let Some(guild_id) = ctx.guild_id() else {
        return;
    };
    let user_id = ctx.author().id;
    let redis = &ctx.data().core.redis;
    let key = gambling_cooldown_key(guild_id, user_id);

    // A failed DEL leaves the player throttled even though they were never charged.
    if let Err(e) = redis.del::<(), _>(&key).await {
        warn!(
            error = ?e,
            cooldown_key = %key,
            %guild_id,
            %user_id,
            "Failed to release gambling cooldown; the player may be throttled despite not being \
             charged"
        );
    }
}
