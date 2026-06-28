use fred::prelude::*;
use fred::types::{Expiration, SetOptions};

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

    Ok(res.is_some())
}

pub async fn release_lock(
    client: &Client,
    key: &str,
    value: &str,
) -> Result<(), Error> {
    let script = r#"
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
        else
            return 0
        end
    "#;

    let _: u32 = client.eval(script, key, value).await?;

    Ok(())
}