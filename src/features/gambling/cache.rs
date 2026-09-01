use crate::core::config::state::Context;
use crate::features::gambling::keys::gambling_cooldown_key;
use crate::features::gambling::types::GamblingConfig;
use fred::interfaces::KeysInterface;
use fred::prelude::{Expiration, SetOptions};
use humantime::format_duration;
use std::time::Duration;

/// Try to acquire the global gambling cooldown for this user.
///
/// * Returns `None` when no cooldown is configured or acquisition succeeded (ready to play).
/// * Returns `Some(wait_msg)` when the user is still on cooldown.
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

    let acquired: Option<String> = redis
        .set(
            &key,
            "1",
            Some(Expiration::EX(secs)),
            Some(SetOptions::NX),
            false,
        )
        .await
        .ok()
        .flatten();

    if acquired.is_some() {
        return None;
    }

    let remaining = redis.ttl::<i64, _>(&key).await.unwrap_or(0);
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
    let _: () = redis.del(&key).await.unwrap_or(());
}
