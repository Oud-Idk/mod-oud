use crate::core::config::state::{Context, Error};
use crate::features::gambling::keys::gambling_cooldown_key;
use crate::features::gambling::types::GamblingConfig;
use fred::interfaces::KeysInterface;
use fred::prelude::{Expiration, SetOptions};
use humantime::format_duration;
use std::time::Duration;

/// Try to acquire the global gambling cooldown for this user.
///
/// * Returns `Ok(None)` when no cooldown is configured or acquisition succeeded.
/// * Returns `Ok(Some(wait_msg))` when the user is still on cooldown (no key set).
pub async fn try_acquire_gambling_cooldown(
    ctx: &Context<'_>,
    config: &GamblingConfig,
) -> Result<Option<String>, Error> {
    let secs = config.cooldown_secs.max(0);
    if secs == 0 {
        return Ok(None);
    }
    let guild_id = ctx.guild_id().unwrap();
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
        .ok();

    if acquired.is_some() {
        return Ok(None);
    }

    let remaining = redis.ttl::<i64, _>(&key).await.unwrap_or(0);
    #[allow(clippy::cast_sign_loss)]
    let wait_secs = remaining.max(0) as u64;
    let wait_time = format_duration(Duration::from_secs(wait_secs));
    Ok(Some(format!(
        "You're on cooldown. Try again in {wait_time}."
    )))
}

/// Release a previously-acquired cooldown (used when bet deduction fails so we
/// don't punish users with insufficient funds).
pub async fn release_gambling_cooldown(ctx: &Context<'_>) -> Result<(), Error> {
    let guild_id = ctx.guild_id().unwrap();
    let user_id = ctx.author().id;
    let redis = &ctx.data().core.redis;
    let key = gambling_cooldown_key(guild_id, user_id);
    let _: () = redis.del(&key).await.unwrap_or(());
    Ok(())
}
