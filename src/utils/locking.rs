use fred::prelude::*;
use fred::types::{Expiration, SetOptions};
use tracing::{debug, instrument};

#[instrument(skip(client), fields(key = %key, value = %value))]
pub async fn acquire_lock(
    client: &Client,
    key: &str,
    value: &str,
    expiry_secs: u64,
) -> Result<bool, Error> {
    let res: Option<String> = client
        .set(
            key,
            value,
            Some(Expiration::EX(expiry_secs as i64)),
            Some(SetOptions::NX),
            false,
        )
        .await?;

    let success = res.is_some();
    debug!(success, "Attempted to acquire Redis lock");

    Ok(success)
}

#[instrument(skip(client), fields(key = %key, value = %value))]
pub async fn release_lock(
    client: &Client,
    key: &str,
    value: &str,
) -> Result<bool, Error> {
    let script = r#"
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
        else
            return 0
        end
    "#;

    let res: u32 = client.eval(script, key, value).await?;
    let success = res == 1;

    debug!(success, "Attempted to release Redis lock");

    Ok(success)
}