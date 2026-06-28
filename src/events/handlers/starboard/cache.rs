use crate::events::handlers::starboard::starboard::StarboardOp;
use crate::types::Error;
use fred::prelude::{Expiration, KeysInterface, LuaInterface, SetOptions};
use tracing::instrument;

/// Attempts to run the increment/decrement operation only if the cache key already exists.
#[instrument(skip(redis))]
pub async fn apply_starboard_op_if_exists(
    redis: &fred::clients::Client,
    key: &str,
    op: StarboardOp,
) -> Result<Option<u64>, Error> {
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

/// Attempts to acquire a distributed lock using SET NX EX.
#[instrument(skip(redis))]
pub async fn acquire_starboard_lock(
    redis: &fred::clients::Client,
    lock_key: &str,
    lock_value: &str,
) -> Result<Option<String>, Error> {
    let result = redis
        .set(
            lock_key,
            lock_value,
            Some(Expiration::EX(15)),
            Some(SetOptions::NX),
            false, // get = false
        )
        .await?;

    Ok(result)
}

/// Safely releases the lock only if the value matches our worker ID.
#[instrument(skip(redis))]
pub async fn release_starboard_lock(
    redis: &fred::clients::Client,
    lock_key: &str,
    lock_value: &str,
) -> Result<u32, Error> {
    let result = redis
        .eval(
            r#"
                if redis.call("get", KEYS[1]) == ARGV[1] then
                    return redis.call("del", KEYS[1])
                else
                    return 0
                end
            "#,
            lock_key,
            lock_value,
        )
        .await?;

    Ok(result)
}