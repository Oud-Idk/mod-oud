use redis::aio::MultiplexedConnection;

pub async fn acquire_lock(
    conn: &mut MultiplexedConnection,
    key: &str,
    value: &str,
    expiry_secs: usize,
) -> Result<bool, redis::RedisError> {
    let res: Option<String> = redis::cmd("SET")
        .arg(key)
        .arg(value)
        .arg("NX")
        .arg("EX")
        .arg(expiry_secs)
        .query_async(conn)
        .await?;
    Ok(res.is_some())
}

pub async fn release_lock(
    conn: &mut MultiplexedConnection,
    key: &str,
    value: &str,
) -> Result<(), redis::RedisError> {
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
        .query_async(conn)
        .await?;
    Ok(())
}