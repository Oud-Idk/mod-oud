use fred::clients::Client;
use fred::interfaces::KeysInterface;
use fred::prelude::Expiration;
use sqlx::PgPool;
use sqlx::types::Json;
use crate::Error;
use crate::features::custom_commands::types::{CommandAction, CooldownType, CustomCommand};

pub async fn get_custom_command_by_name(
    pool: &PgPool,
    redis: &Client,
    guild_id: i64,
    cmd_name: &str,
) -> Result<Option<CustomCommand>, Error> {
    let cache_key = format!("cmd:{}:{}", guild_id, cmd_name);

    if let Ok(Some(cached_json)) = redis.get::<Option<String>, _>(&cache_key).await {
        if cached_json == "none" {
            return Ok(None);
        }
        if let Ok(cmd) = serde_json::from_str::<CustomCommand>(&cached_json) {
            return Ok(Some(cmd));
        }
    }

    let command = sqlx::query_as!(
        CustomCommand,
        r#"
        SELECT id, guild_id, name, description, enabled, delete_trigger,
               cooldown_type as "cooldown_type: CooldownType", cooldown_seconds,
               allowed_roles, ignored_roles, allowed_channels, ignored_channels,
               actions as "actions: Json<Vec<CommandAction>>"
        FROM custom_commands
        WHERE guild_id = $1 AND LOWER(name) = $2 AND enabled = TRUE
        "#,
        guild_id,
        cmd_name
    )
        .fetch_optional(pool)
        .await?;

    // 3. Write to Redis (300 seconds cache TTL)
    if let Some(ref cmd) = command {
        if let Ok(json_str) = serde_json::to_string(cmd) {
            let _ = redis.set::<(), _, _>(&cache_key, json_str, Some(Expiration::EX(300)), None, false).await;
        }
    } else {
        // Negative cache for 30s to avoid DB spam for non-existent commands
        let _ = redis.set::<(), _, _>(&cache_key, "none", Some(Expiration::EX(30)), None, false).await;
    }

    Ok(command)
}