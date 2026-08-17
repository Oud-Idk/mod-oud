use crate::core::config::state::Error;
use crate::features::custom_commands::types::{CommandAction, CooldownType, CustomCommand};
use crate::features::custom_commands::{cache, keys};
use fred::clients::Client;
use sqlx::PgPool;
use sqlx::types::Json;

pub async fn get_custom_command_by_name(
    pool: &PgPool,
    redis: &Client,
    guild_id: u64,
    cmd_name: &str,
) -> Result<Option<CustomCommand>, Error> {
    let cache_key = keys::custom_command_key(guild_id, cmd_name);

    if let Some(value) = cache::get_custom_command_from_redis(redis, &cache_key).await {
        return Ok(Some(value));
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
        guild_id.cast_signed(),
        cmd_name
    )
    .fetch_optional(pool)
    .await?;

    cache::cache_command_to_redis(redis, &cache_key, command.as_ref()).await;

    Ok(command)
}
