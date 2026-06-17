pub async fn acquire_lock(
    client: &redis::Client,
    key: &str,
    value: &str,
    expiry_secs: usize,
) -> Result<bool, redis::RedisError> {
    let mut conn = client.get_multiplexed_async_connection().await?;
    let res: Option<String> = redis::cmd("SET")
        .arg(key)
        .arg(value)
        .arg("NX")
        .arg("EX")
        .arg(expiry_secs)
        .query_async(&mut conn)
        .await?;
    Ok(res.is_some())
}

pub async fn release_lock(
    client: &redis::Client,
    key: &str,
    value: &str,
) -> Result<(), redis::RedisError> {
    let mut conn = client.get_multiplexed_async_connection().await?;
    let script = r#"
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
        else
            return 0
        end
    "#;
    let _: () = redis::cmd("EVAL")
        .arg(script)
        .arg(1)
        .arg(key)
        .arg(value)
        .query_async(&mut conn)
        .await?;
    Ok(())
}