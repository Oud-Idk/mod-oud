use crate::features::starboard::types::{RestrictionType, Starboard, StarboardOp};
use crate::shared::embed::DiscordEmbed;
use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use fred::clients::Client;
use fred::interfaces::{FredResult, KeysInterface, LuaInterface};
use fred::types::Expiration;
use sqlx::PgPool;
use sqlx::postgres::types::PgInterval;
use sqlx::types::Json;
use tracing::instrument;

#[derive(Debug, sqlx::FromRow)]
pub struct StarboardRow {
    pub id: i64,
    pub guild_id: i64,
    pub starboard_channel_id: i64,
    pub emojis: Vec<String>,
    pub reaction_threshold: i32,

    // Only the message ages stay optional!
    pub min_message_age: Option<PgInterval>,
    pub max_message_age: Option<PgInterval>,

    pub prevent_self_star: bool,
    pub allow_bot_messages: bool,
    pub keep_deleted_messages: bool,
    pub role_restriction_type: RestrictionType,
    pub restricted_roles: Vec<i64>,
    pub channel_restriction_type: RestrictionType,
    pub restricted_channels: Vec<i64>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub embed_template: Json<DiscordEmbed>,
    pub plaintext_template: String,
}

impl From<StarboardRow> for Starboard {
    fn from(row: StarboardRow) -> Self {
        Self {
            id: row.id,
            guild_id: row.guild_id.cast_unsigned().into(),
            starboard_channel_id: row.starboard_channel_id.cast_unsigned().into(),
            emojis: row.emojis,
            reaction_threshold: row.reaction_threshold,
            min_message_age: row.min_message_age,
            max_message_age: row.max_message_age,
            prevent_self_star: row.prevent_self_star,
            allow_bot_messages: row.allow_bot_messages,
            keep_deleted_messages: row.keep_deleted_messages,
            role_restriction_type: row.role_restriction_type,
            restricted_roles: row
                .restricted_roles
                .into_iter()
                .map(|id| id.cast_unsigned().into())
                .collect(),
            channel_restriction_type: row.channel_restriction_type,
            restricted_channels: row
                .restricted_channels
                .into_iter()
                .map(|id| id.cast_unsigned().into())
                .collect(),
            created_at: row.created_at,
            updated_at: row.updated_at,
            embed_template: row.embed_template,
            plaintext_template: row.plaintext_template,
        }
    }
}

pub async fn get_starboards(guild_id: u64, db: &PgPool, redis: &Client) -> Result<Vec<Starboard>> {
    let cache_key = format!("starboard:config:{guild_id}");

    if let Ok(Some(cached_data)) = redis.get::<Option<String>, _>(&cache_key).await
        && let Ok(configs) = serde_json::from_str::<Vec<Starboard>>(&cached_data)
    {
        return Ok(configs);
    }

    let rows = sqlx::query_as!(
        StarboardRow,
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
        guild_id.cast_signed(),
    )
    .fetch_all(db)
    .await
    .context("Failed to query starboard configurations from Postgres")?;

    let starboards: Vec<Starboard> = rows.into_iter().map(Starboard::from).collect();

    if let Ok(serialized) = serde_json::to_string(&starboards) {
        let _: Result<(), _> = redis
            .set(
                &cache_key,
                serialized,
                Some(Expiration::EX(86400)),
                None,
                false,
            )
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

/// Fetches the current cached star count for a starboard entry, if present.
pub async fn get_starboard_count(redis: &Client, key: &str) -> Option<u64> {
    redis.get::<Option<u64>, _>(key).await.unwrap_or(None)
}

/// Caches the emoji reaction count for a starboard entry with a 1-hour expiration.
///
/// # Errors
/// Returns `Err` if Redis fails to set the key.
pub async fn cache_emoji_count(redis: &Client, key: &str, count: u64) -> FredResult<()> {
    redis
        .set(key, count, Some(Expiration::EX(3600)), None, false)
        .await
}
