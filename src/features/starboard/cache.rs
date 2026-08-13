use crate::features::starboard::types::{RestrictionType, Starboard, StarboardOp};
use crate::shared::embed::DiscordEmbed;
use anyhow::{Context, Result};
use fred::clients::Client;
use fred::interfaces::{KeysInterface, LuaInterface};
use fred::types::Expiration;
use sqlx::PgPool;
use sqlx::postgres::types::PgInterval;
use sqlx::types::Json;
use tracing::instrument;

pub async fn get_starboards(
    guild_id: i64,
    db: &PgPool,
    redis: &Client,
) -> Result<Vec<Starboard>> {
    let cache_key = format!("starboard:config:{guild_id}");

    if let Ok(Some(cached_data)) = redis.get::<Option<String>, _>(&cache_key).await
        && let Ok(configs) = serde_json::from_str::<Vec<Starboard>>(&cached_data) {
            return Ok(configs);
        }

    let starboards = sqlx::query_as!(
        Starboard,
        r#"
        SELECT
            id,
            guild_id,
            starboard_channel_id,
            emojis,
            reaction_threshold,
            min_message_age as "min_message_age: PgInterval",
            max_message_age as "max_message_age: PgInterval",
            prevent_self_star,
            allow_bot_messages,
            keep_deleted_messages,
            role_restriction_type as "role_restriction_type: RestrictionType",
            restricted_roles,
            channel_restriction_type as "channel_restriction_type: RestrictionType",
            restricted_channels,
            created_at,
            updated_at,
            embed_template as "embed_template: Json<DiscordEmbed>",
            plaintext_template
        FROM starboards
        WHERE guild_id = $1
        "#,
        guild_id,
    )
        .fetch_all(db)
        .await
        .context("Failed to query starboard configurations from Postgres")?;

    if let Ok(serialized) = serde_json::to_string(&starboards) {
        let _: Result<(), _> = redis
            .set(&cache_key, serialized, Some(Expiration::EX(86400)), None, false)
            .await;
    }

    Ok(starboards)
}

#[instrument(skip(redis))]
pub async fn apply_starboard_op_if_exists(
    redis: &Client,
    key: &str,
    op: StarboardOp,
) -> Result<Option<u64>> {
    let redis_cmd = match op {
        StarboardOp::Add => "INCR",
        StarboardOp::Remove => "DECR",
    };

    let result = redis
        .eval(
            r#"
                if redis.call("EXISTS", KEYS[1]) == 1 then
                    return redis.call(ARGV[1], KEYS[1])
                else
                    return nil
                end
            "#,
            key,
            redis_cmd,
        )
        .await?;

    Ok(result)
}