use crate::features::dynamic_slowmode::keys;
use anyhow::{Context, Result};
use fred::clients::{Client, Transaction};
use fred::interfaces::{KeysInterface, SortedSetsInterface, TransactionInterface};
use fred::prelude::{Expiration, SetOptions};
use fred::types::ExpireOptions;
use fred::types::sorted_sets::Ordering;
use serenity::all::{ChannelId, GuildId, UserId};
use tracing::warn;

/// Unique member for the volume set, so two messages in the same microsecond do not collapse.
fn volume_member(now: f64) -> String {
    let random_suffix: u16 = rand::random();
    format!("{now}:{random_suffix}")
}

/// Counts one message into a channel's author and volume windows.
///
/// Both keys are pruned and written in one `MULTI`, so a tick never sees one without the other.
#[allow(clippy::cast_precision_loss)]
pub async fn record_message(
    redis: &Client,
    guild_id: GuildId,
    channel_id: ChannelId,
    user_id: UserId,
    window_secs: u64,
) -> Result<()> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs_f64();
    let window = window_secs as f64;
    let clear_before = now - window;
    let ttl = i64::try_from(window_secs.saturating_mul(2)).unwrap_or(i64::MAX);

    let authors = keys::authors_key(guild_id, channel_id);
    let volume = keys::volume_key(guild_id, channel_id);

    let tx: Transaction = redis.multi();
    let _: () = tx.zremrangebyscore(&authors, "-inf", clear_before).await?;
    let _: () = tx
        .zadd(
            &authors,
            None::<SetOptions>,
            None::<Ordering>,
            false,
            false,
            (now, user_id.get().to_string()),
        )
        .await?;
    let _: () = tx.expire(&authors, ttl, None::<ExpireOptions>).await?;

    let _: () = tx.zremrangebyscore(&volume, "-inf", clear_before).await?;
    let _: () = tx
        .zadd(
            &volume,
            None::<SetOptions>,
            None::<Ordering>,
            false,
            false,
            (now, volume_member(now)),
        )
        .await?;
    let _: () = tx.expire(&volume, ttl, None::<ExpireOptions>).await?;

    let _: (usize, usize, usize, usize, usize, usize) = tx.exec(true).await?;

    Ok(())
}

/// Distinct authors and message count currently in the channel's window.
///
/// Counted by score, not set size, so a quiet channel stops reporting its last burst.
#[allow(clippy::cast_precision_loss)]
pub async fn read_counts(
    redis: &Client,
    guild_id: GuildId,
    channel_id: ChannelId,
    window_secs: u64,
) -> Result<(u32, u32)> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs_f64();
    let clear_before = now - window_secs as f64;

    let authors: u32 = redis
        .zcount(keys::authors_key(guild_id, channel_id), clear_before, now)
        .await
        .context("slowmode author count read failed")?;
    let volume: u32 = redis
        .zcount(keys::volume_key(guild_id, channel_id), clear_before, now)
        .await
        .context("slowmode volume count read failed")?;

    Ok((authors, volume))
}

/// Benches a channel after a 429, so the next tick leaves it alone.
pub async fn bench_channel(redis: &Client, channel_id: ChannelId, secs: i64) {
    if let Err(e) = redis
        .set::<(), _, _>(
            keys::bench_key(channel_id),
            "1",
            Some(Expiration::EX(secs)),
            None,
            false,
        )
        .await
    {
        warn!(error = ?e, %channel_id, "slowmode bench write failed");
    }
}

/// Whether a channel is currently benched.
///
/// # Errors
/// Returns `Err` if Redis fails.
pub async fn is_benched(redis: &Client, channel_id: ChannelId) -> Result<bool> {
    let exists: bool = redis
        .exists(keys::bench_key(channel_id))
        .await
        .context("slowmode bench read failed")?;
    Ok(exists)
}
