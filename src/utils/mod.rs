use crate::types::Error;
use fred::clients::Client;
use fred::interfaces::KeysInterface;
use fred::types::Expiration;
use sqlx::PgPool;
use tracing::debug;

pub mod custom_msg;
pub mod ticket;
pub mod moderation;
pub mod reminder;
pub mod verification;

pub mod string_i64 {
    use serde::{Deserialize, Deserializer, Serialize, Serializer};

    pub fn serialize<S>(val: &i64, s: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer
    {
        val.to_string().serialize(s)
    }

    pub fn deserialize<'de, D>(d: D) -> Result<i64, D::Error>
    where
        D: Deserializer<'de>
    {
        String::deserialize(d)?.parse().map_err(serde::de::Error::custom)
    }
}

pub mod opt_string_i64 {
    use serde::{Deserialize, Deserializer, Serialize, Serializer};

    pub fn serialize<S>(val: &Option<i64>, s: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer
    {
        val.map(|v| v.to_string()).serialize(s)
    }

    pub fn deserialize<'de, D>(d: D) -> Result<Option<i64>, D::Error>
    where
        D: Deserializer<'de>
    {
        Option::<String>::deserialize(d)?
            .map(|s| s.parse().map_err(serde::de::Error::custom))
            .transpose()
    }
}

/// Stores or updates the username relation in both Postgres and Redis.
pub async fn store_username_relation(
    db: &PgPool,
    redis: &Client,
    id: u64,
    name: &str,
) -> Result<(), Error> {
    debug!(id, name, "Storing relation");

    sqlx::query!(
        "INSERT INTO discord_users (user_id, username, updated_at) \
         VALUES ($1, $2, NOW()) \
         ON CONFLICT (user_id) \
         DO UPDATE SET username = $2, updated_at = NOW()",
        id as i64,
        name
    )
        .execute(db)
        .await?;

    let redis_key = format!("username:{}", id);

    redis.set::<(), &str, &str>(
        &redis_key, name, Some(Expiration::EX(86400)), None, false,
    ).await?;

    Ok(())
}

/// Fetches a username, checking Redis first, then Postgres.
pub async fn get_username(
    db: &PgPool,
    redis: &Client,
    id: u64,
) -> Result<Option<String>, Error> {
    let redis_key = format!("username:{}", id);

    if let Ok(cached_name) = redis.get::<String, &str>(&redis_key).await {
        return Ok(Some(cached_name));
    }

    let db_record = sqlx::query!(
        "SELECT username FROM discord_users WHERE user_id = $1",
        id as i64
    )
        .fetch_optional(db)
        .await?;

    if let Some(record) = db_record {
        redis.set::<(), &str, &str>(
            &redis_key, &record.username, Some(Expiration::EX(86400)), None, false,
        ).await?;

        return Ok(Some(record.username));
    }

    Ok(None)
}