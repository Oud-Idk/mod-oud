use crate::core::config::state::Error;
use fred::clients::Client;
use fred::interfaces::KeysInterface;
use fred::prelude::{Expiration, SetOptions};
use humantime::{FormattedDuration, format_duration};
use std::time::Duration;

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
        .ok();

    if acquired.is_none() {
        let remaining =
            u64::try_from(redis.ttl::<i64, _>(key).await.unwrap_or(0).max(0)).unwrap_or(0);
        return Ok(Some(format_duration(Duration::from_secs(remaining))));
    }

    Ok(None)
}
