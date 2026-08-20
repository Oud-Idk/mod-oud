use crate::features::custom_commands::types::CustomCommand;
use fred::clients::Client;
use fred::interfaces::KeysInterface;
use fred::prelude::Expiration;

pub async fn cache_command_to_redis(
    redis: &Client,
    cache_key: &str,
    command: Option<&CustomCommand>,
) {
    if let Some(cmd) = command {
        if let Ok(json_str) = serde_json::to_string(cmd) {
            let _ = redis
                .set::<(), _, _>(cache_key, json_str, Some(Expiration::EX(300)), None, false)
                .await;
        }
    } else {
        // Negative cache for 30s to avoid DB spam for non-existent commands
        let _ = redis
            .set::<(), _, _>(cache_key, "none", Some(Expiration::EX(30)), None, false)
            .await;
    }
}

pub async fn get_custom_command_from_redis(
    redis: &Client,
    cache_key: &str,
) -> Option<CustomCommand> {
    // Early exit if Redis fails or key doesn't exist
    let Ok(Some(cached_str)) = redis.get::<Option<String>, _>(cache_key).await else {
        return None;
    };

    // Check for negative cache ("none")
    if cached_str == "none" {
        return None;
    }

    // Try parsing JSON; if bad JSON, treat as Miss so DB can refresh it
    serde_json::from_str::<CustomCommand>(&cached_str).ok()
}

/// Checks whether a custom command is on cooldown, setting the cooldown if it is not.
/// Returns `Ok(true)` if the command is currently on cooldown.
///
/// # Errors
/// Returns `Err` if Redis fails during the existence check or cooldown set.
pub async fn check_and_set_command_cooldown(
    redis: &Client,
    key: &str,
    cooldown_seconds: i64,
) -> Result<bool, fred::error::Error> {
    let is_on_cooldown: bool = redis.exists(key).await?;
    if is_on_cooldown {
        return Ok(true);
    }
    let _: () = redis
        .set(
            key,
            "1",
            Some(Expiration::EX(cooldown_seconds)),
            None,
            false,
        )
        .await?;
    Ok(false)
}
