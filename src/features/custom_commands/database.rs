use crate::core::config::state::Error;
use crate::features::custom_commands::types::{
    CommandAction, CooldownType, CustomCommand, CustomCommandRow,
};
use crate::features::custom_commands::{cache, keys};
use fred::clients::Client;
use serenity::all::GuildId;
use sqlx::PgPool;
use sqlx::types::Json;

pub async fn get_custom_command_by_name(
    pool: &PgPool,
    redis: &Client,
    guild_id: GuildId,
    cmd_name: &str,
) -> Result<Option<CustomCommand>, Error> {
    let normalized_name = cmd_name.to_lowercase();
    let cache_key = keys::custom_command_key(guild_id, &normalized_name);

    if let Some(value) = cache::get_custom_command_from_redis(redis, &cache_key).await {
        return Ok(Some(value));
    }

    let command = sqlx::query_as!(
        CustomCommandRow,
        r#"
        SELECT id, guild_id, name, description, enabled, delete_trigger,
               cooldown_type as "cooldown_type: CooldownType", cooldown_seconds,
               allowed_roles, ignored_roles, allowed_channels, ignored_channels,
               actions as "actions: Json<Vec<CommandAction>>"
        FROM custom_commands
        WHERE guild_id = $1 AND LOWER(name) = $2 AND enabled = TRUE
        "#,
        guild_id.get().cast_signed(),
        normalized_name
    )
    .fetch_optional(pool)
    .await?
    .map(CustomCommand::from);

    cache::cache_command_to_redis(redis, &cache_key, command.as_ref()).await;

    Ok(command)
}

pub async fn get_custom_command(
    pool: &PgPool,
    guild_id: GuildId,
) -> Result<Vec<SimpleCustomCommand>, sqlx::Error> {
    sqlx::query_as!(
        SimpleCustomCommand,
        r#"
        SELECT name, description
        FROM custom_commands
        WHERE guild_id = $1 AND enabled = TRUE
        ORDER BY name ASC
        "#,
        guild_id.get().cast_signed()
    )
    .fetch_all(pool)
    .await
}

pub struct SimpleCustomCommand {
    pub name: String,
    pub description: Option<String>,
}
