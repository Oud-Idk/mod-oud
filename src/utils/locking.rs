use fred::prelude::*;
use fred::types::{Expiration, SetOptions};
use tokio::sync::oneshot;
use tokio::time::{self, Duration};
use tracing::{debug, instrument, trace, warn};

pub struct LockGuard {
    client: Client,
    key: String,
    value: String,
    cancel_tx: Option<oneshot::Sender<()>>,
}

impl LockGuard {
    /// Explicitly release the lock. This stops the watchdog immediately and deletes the key in Redis.
    #[instrument(skip(self), fields(key = %self.key, value = %self.value))]
    pub async fn release(mut self) -> Result<bool, Error> {
        // Stop the watchdog background task first
        if let Some(tx) = self.cancel_tx.take() {
            let _ = tx.send(());
        }

        let script = r#"
            if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("del", KEYS[1])
            else
                return 0
            end
        "#;

        let res: u32 = self.client.eval(script, self.key.clone(), self.value.clone()).await?;
        let success = res == 1;

        trace!(success, "Attempted to release Redis lock via guard");
        Ok(success)
    }
}

// If the guard goes out of scope because of a panic or early return,
// we drop the sender
impl Drop for LockGuard {
    fn drop(&mut self) {
        if let Some(tx) = self.cancel_tx.take() {
            let _ = tx.send(());
        }
    }
}

#[instrument(skip(client), fields(key = %key, value = %value))]
pub async fn acquire_lock(
    client: &Client,
    key: &str,
    value: &str,
    heartbeat_interval_secs: u64,
) -> Result<Option<LockGuard>, Error> {
    // We set the initial TTL to 3x the heartbeat.
    // If a heartbeat fails once due to a transient network hiccup, we don't instantly lose the lock.
    let ttl_secs = heartbeat_interval_secs * 3;

    let res: Option<String> = client
        .set(
            key,
            value,
            Some(Expiration::EX(ttl_secs as i64)),
            Some(SetOptions::NX),
            false,
        )
        .await?;

    if res.is_none() {
        return Ok(None);
    }

    let (cancel_tx, mut cancel_rx) = oneshot::channel::<()>();

    // Spawn the background watchdog to periodically extend the lock TTL
    let client_clone = client.clone();
    let key_string = key.to_string();
    let value_string = value.to_string();

    tokio::spawn(async move {
        let mut interval = time::interval(Duration::from_secs(heartbeat_interval_secs));
        // Skip the immediate first tick, as `time::interval` fires instantly on creation.
        interval.tick().await;

        loop {
            tokio::select! {
                _ = &mut cancel_rx => {
                    // Lock was explicitly released or the guard was dropped. Stop renewing.
                    break;
                }
                _ = interval.tick() => {
                    // Lua script: Only extend the expiration if we still own the lock!
                    let script = r#"
                        if redis.call("get", KEYS[1]) == ARGV[1] then
                            return redis.call("expire", KEYS[1], ARGV[2])
                        else
                            return 0
                        end
                    "#;

                    let args = vec![value_string.clone(), ttl_secs.to_string()];
                    let res: Result<u32, Error> = client_clone
                        .eval(script, key_string.clone(), args)
                        .await;

                    match res {
                        Ok(1) => {
                            trace!(key = %key_string, "Lock TTL extended successfully");
                        }
                        Ok(_) => {
                            warn!(key = %key_string, "Failed to renew lock—we might have lost ownership!");
                            break;
                        }
                        Err(err) => {
                            warn!(key = %key_string, ?err, "Error renewing lock");
                        }
                    }
                }
            }
        }
    });

    Ok(Some(LockGuard {
        client: client.clone(),
        key: key.to_string(),
        value: value.to_string(),
        cancel_tx: Some(cancel_tx),
    }))
}