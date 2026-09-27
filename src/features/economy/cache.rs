use crate::core::config::state::Error;
use fred::clients::Client;
use fred::interfaces::KeysInterface;
use fred::prelude::{Expiration, SetOptions};
use humantime::{FormattedDuration, format_duration};
use std::time::Duration;
use tracing::{error, warn};

/// Claims a cooldown slot.
///
/// * `Ok(None)`: no cooldown configured, or the slot was acquired.
/// * `Ok(Some(wait))`: the slot is held by someone else.
///
/// A Redis failure propagates rather than reporting a cooldown, so the two stay distinguishable.
pub async fn check_cooldown(
    redis: &Client,
    key: &str,
    secs: i64,
) -> Result<Option<FormattedDuration>, Error> {
    if secs <= 0 {
        return Ok(None);
    }

    let acquired: Option<String> = redis
        .set(
            key,
            "1",
            Some(Expiration::EX(secs)),
            Some(SetOptions::NX),
            false,
        )
        .await
        .inspect_err(|e| {
            error!(
                error = ?e,
                cooldown_key = key,
                cooldown_secs = secs,
                "cooldown SET failed; the cooldown is not being enforced"
            );
        })?;

    if acquired.is_some() {
        return Ok(None);
    }

    // `Ok(None)` from SET NX means the key exists, so this is a real cooldown.
    let remaining = match redis.ttl::<i64, _>(key).await {
        Ok(secs) => u64::try_from(secs.max(0)).unwrap_or(0),
        Err(e) => {
            warn!(
                error = ?e,
                cooldown_key = key,
                fallback = "0s wait",
                "cooldown TTL lookup failed"
            );
            0
        }
    };

    Ok(Some(format_duration(Duration::from_secs(remaining))))
}
