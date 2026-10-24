use crate::core::config::settings::{GuildSettings, get_settings};
use crate::features::dynamic_slowmode::audit;
use crate::features::dynamic_slowmode::cache;
use crate::features::dynamic_slowmode::calculation;
use crate::features::dynamic_slowmode::database;
use crate::features::dynamic_slowmode::types::{
    DisarmReason, DynamicSlowmodeConfig, MAX_EDITS_PER_TICK, RATE_LIMIT_BENCH_SECS,
    SlowmodeChannelState,
};
use crate::shared::locking::acquire_lock;
use crate::shared::task;
use anyhow::Result;
use chrono::{DateTime, Utc};
use fred::clients::Client;
use moka::future::Cache;
use serenity::all::{ChannelId, EditChannel, GuildId, Http, HttpError, StatusCode};
use sqlx::PgPool;
use std::sync::Arc;
use std::time::Duration;
use tracing::{debug, info, instrument, trace, warn};

/// How often the tick runs.
const TICK_SECS: u64 = 15;

/// The handles the worker needs, so it does not depend on the fully built [`BotData`].
///
/// [`BotData`]: crate::core::config::state::BotData
#[derive(Clone)]
pub struct SlowmodeWorkerParams {
    /// Database pool.
    pub db: PgPool,
    /// Redis client.
    pub redis: Client,
    /// Guild settings cache.
    pub guild_configs_cache: Cache<GuildId, GuildSettings>,
    /// Serenity HTTP client.
    pub http: Arc<Http>,
}

/// Spawns the worker that raises and lowers channel slowmode.
///
/// One writer cluster-wide: serenity cannot see the undocumented channel-edit sublimit.
pub fn start_slowmode_worker(params: SlowmodeWorkerParams) {
    task::spawn("dynamic_slowmode_worker", async move {
        let lock_key = "lock:dynamic_slowmode_worker";
        let lock_value = format!("worker-{}", Utc::now().timestamp_millis());

        info!(worker_id = %lock_value, "dynamic slowmode worker started");

        loop {
            tokio::time::sleep(Duration::from_secs(TICK_SECS)).await;

            match acquire_lock(&params.redis, lock_key, &lock_value, 10).await {
                Ok(Some(guard)) => {
                    if let Err(e) = run_tick(&params).await {
                        warn!(error = ?e, "dynamic slowmode tick failed");
                    }

                    match guard.release().await {
                        Ok(true) => trace!("slowmode lock released"),
                        Ok(false) => warn!(%lock_key, "slowmode lock lost during tick"),
                        Err(e) => warn!(error = ?e, "slowmode lock release failed"),
                    }
                }
                Ok(None) => trace!("slowmode lock held by another worker; skipping tick"),
                Err(e) => warn!(error = ?e, "slowmode lock acquire failed"),
            }
        }
    });
}

/// One pass: adjust every armed channel.
///
/// Scans the state table rather than a "recently active" set, which could drop a guild mid-tick.
#[instrument(skip_all)]
async fn run_tick(params: &SlowmodeWorkerParams) -> Result<()> {
    let states = database::list_all_armed(&params.db).await?;

    let mut edited = 0_usize;
    let mut configs: std::collections::HashMap<GuildId, Option<DynamicSlowmodeConfig>> =
        std::collections::HashMap::new();

    for state in states {
        if edited >= MAX_EDITS_PER_TICK {
            break;
        }

        let config = if let Some(cached) = configs.get(&state.guild_id) {
            cached.clone()
        } else {
            let loaded = match load_config(params, state.guild_id).await {
                Ok(loaded) => loaded,
                Err(e) => {
                    warn!(error = ?e, guild_id = %state.guild_id, "slowmode policy load failed");
                    continue;
                }
            };
            configs.insert(state.guild_id, loaded.clone());
            loaded
        };

        let outcome = match config {
            // A row that is still armed but no longer covered by an enabled policy has to be put
            // back, not just dropped. Turning the feature off from the dashboard never runs a
            // command, so this is the only place that can notice.
            Some(config) if config.channels.contains(&state.channel_id) => {
                adjust_channel(params, &config, &state).await
            }
            _ => retire_channel(params, &state).await,
        };

        match outcome {
            Ok(true) => edited += 1,
            Ok(false) => {}
            // One bad channel must not starve the rest of the table for this tick.
            Err(e) => warn!(
                error = ?e,
                channel_id = %state.channel_id,
                guild_id = %state.guild_id,
                "slowmode channel skipped after error"
            ),
        }
    }

    let armed = arm_new_channels(params, &mut configs).await?;

    debug!(edited, armed, "dynamic slowmode tick finished");
    Ok(())
}

/// Arms configured channels that have no row yet.
///
/// The dashboard writes `guild_configs` directly, so nothing else creates the row. Returns the count.
#[instrument(skip_all)]
async fn arm_new_channels(
    params: &SlowmodeWorkerParams,
    configs: &mut std::collections::HashMap<GuildId, Option<DynamicSlowmodeConfig>>,
) -> Result<usize> {
    let tracked: std::collections::HashSet<ChannelId> =
        database::list_tracked_channel_ids(&params.db)
            .await?
            .into_iter()
            .collect();

    let mut armed = 0_usize;

    for guild_id in database::list_enabled_guild_ids(&params.db).await? {
        if armed >= MAX_EDITS_PER_TICK {
            break;
        }

        let config = if let Some(cached) = configs.get(&guild_id) {
            cached.clone()
        } else {
            let loaded = match load_config(params, guild_id).await {
                Ok(loaded) => loaded,
                Err(e) => {
                    warn!(error = ?e, %guild_id, "slowmode policy load failed");
                    continue;
                }
            };
            configs.insert(guild_id, loaded.clone());
            loaded
        };

        let Some(config) = config else {
            continue;
        };

        for channel_id in &config.channels {
            if armed >= MAX_EDITS_PER_TICK || tracked.contains(channel_id) {
                continue;
            }

            // A category or forum has no slowmode to snapshot, so there is nothing to arm.
            let pre = match live_slowmode(params.http.as_ref(), *channel_id).await {
                Ok(Some(pre)) => pre,
                Ok(None) => {
                    debug!(channel_id = %channel_id, "channel cannot carry slowmode; not arming");
                    continue;
                }
                Err(e) => {
                    debug!(error = ?e, channel_id = %channel_id, "slowmode read at arm failed");
                    continue;
                }
            };

            database::arm(&params.db, *channel_id, guild_id, pre).await?;
            audit::armed(guild_id, *channel_id, pre);
            armed += 1;
        }
    }

    Ok(armed)
}

/// Applies the control law to one channel. Returns whether an edit was made.
#[instrument(skip_all, fields(channel_id = %state.channel_id))]
async fn adjust_channel(
    params: &SlowmodeWorkerParams,
    config: &DynamicSlowmodeConfig,
    state: &SlowmodeChannelState,
) -> Result<bool> {
    let now = Utc::now();

    if !calculation::is_due(state.last_edit_at, now) {
        return Ok(false);
    }

    if cache::is_benched(&params.redis, state.channel_id).await? {
        trace!("channel is benched after a 429");
        return Ok(false);
    }

    let (authors, volume) = cache::read_counts(
        &params.redis,
        state.guild_id,
        state.channel_id,
        config.window_secs,
    )
    .await?;

    let target = calculation::next_secs(config, state.last_written_secs, authors, volume);

    if target == state.last_written_secs {
        return Ok(false);
    }

    write_slowmode(params, config, state, target, authors, volume, now).await
}

/// How a restore attempt ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RestoreOutcome {
    /// The row is gone, whether or not a PATCH was needed.
    Forgotten,
    /// Discord refused the PATCH. The row stays so a later attempt can retry.
    RateLimited,
}

/// Puts a channel back the way it was found, then drops its row.
///
/// Not gated by the minimum edit interval, so a dashboard toggle takes effect on the next tick.
#[instrument(skip_all, fields(channel_id = %state.channel_id))]
async fn retire_channel(
    params: &SlowmodeWorkerParams,
    state: &SlowmodeChannelState,
) -> Result<bool> {
    if cache::is_benched(&params.redis, state.channel_id).await? {
        return Ok(false);
    }

    match restore_channel(&params.db, params.http.as_ref(), state).await? {
        RestoreOutcome::Forgotten => Ok(true),
        RestoreOutcome::RateLimited => {
            // Bench so the retry does not hammer the same sublimit every tick.
            cache::bench_channel(&params.redis, state.channel_id, RATE_LIMIT_BENCH_SECS).await;
            Ok(false)
        }
    }
}

/// Restores a channel to its pre-automation value and drops the row.
///
/// Only writes when the channel is still where the bot left it; a human's change wins otherwise.
pub async fn restore_channel(
    db: &PgPool,
    http: &Http,
    state: &SlowmodeChannelState,
) -> Result<RestoreOutcome> {
    let Some(live) = live_slowmode(http, state.channel_id).await? else {
        database::forget(db, state.channel_id).await?;
        return Ok(RestoreOutcome::Forgotten);
    };

    if live == state.last_written_secs && live != state.pre_automation_secs {
        match state
            .channel_id
            .edit(
                http,
                EditChannel::new()
                    .rate_limit_per_user(state.pre_automation_secs)
                    .audit_log_reason("dynamic slowmode: restoring pre-automation value"),
            )
            .await
        {
            Ok(_) => audit::restored(state.guild_id, state.channel_id, state.pre_automation_secs),
            Err(e) if is_rate_limited(&e) => {
                warn!(
                    channel_id = %state.channel_id,
                    guild_id = %state.guild_id,
                    "restore rate limited"
                );
                // The row stays, so the value is still recorded and a later attempt can retry.
                return Ok(RestoreOutcome::RateLimited);
            }
            Err(e) => return Err(e.into()),
        }
    }

    database::forget(db, state.channel_id).await?;
    Ok(RestoreOutcome::Forgotten)
}

/// Patches the channel and records the new value. Returns whether the write landed.
async fn write_slowmode(
    params: &SlowmodeWorkerParams,
    config: &DynamicSlowmodeConfig,
    state: &SlowmodeChannelState,
    target: u16,
    authors: u32,
    volume: u32,
    now: DateTime<Utc>,
) -> Result<bool> {
    // Backstop for a missed audit entry: never overwrite a value we did not write. Costs one GET
    // per edit, and edits are capped at one per channel per five minutes.
    match live_slowmode(params.http.as_ref(), state.channel_id).await {
        Ok(Some(live)) if live == state.last_written_secs => {}
        Ok(Some(live)) => {
            warn!(
                channel_id = %state.channel_id,
                guild_id = %state.guild_id,
                expected = state.last_written_secs,
                actual = live,
                "slowmode changed outside the bot; disarming channel"
            );
            database::disarm(
                &params.db,
                state.channel_id,
                DisarmReason::HumanEdit.as_str(),
            )
            .await?;
            audit::disarmed(
                state.guild_id,
                state.channel_id,
                DisarmReason::HumanEdit.as_str(),
            );
            return Ok(false);
        }
        Ok(None) => {
            debug!(channel_id = %state.channel_id, "channel no longer supports slowmode; forgetting it");
            database::forget(&params.db, state.channel_id).await?;
            return Ok(false);
        }
        Err(e) => {
            warn!(error = ?e, channel_id = %state.channel_id, "slowmode read before write failed");
            return Ok(false);
        }
    }

    let reason = format!("dynamic slowmode: {authors} authors, {volume} messages");

    let result = state
        .channel_id
        .edit(
            params.http.as_ref(),
            EditChannel::new()
                .rate_limit_per_user(target)
                .audit_log_reason(&reason),
        )
        .await;

    match result {
        Ok(_) => {
            database::record_write(
                &params.db,
                state.channel_id,
                state.guild_id,
                state.pre_automation_secs,
                target,
                now,
            )
            .await?;

            audit::slowmode_changed(
                state.guild_id,
                state.channel_id,
                state.last_written_secs,
                target,
            );

            if calculation::is_at_ceiling(config, target) {
                audit::ceiling_reached(state.guild_id, state.channel_id, target);
            }

            Ok(true)
        }
        Err(e) if is_rate_limited(&e) => {
            warn!(
                channel_id = %state.channel_id,
                guild_id = %state.guild_id,
                "channel edit rate limited; benching channel"
            );
            // Bench, not disarm: the channel resumes on its own when the bench expires, so an
            // admin does not have to notice and re-arm it.
            cache::bench_channel(&params.redis, state.channel_id, RATE_LIMIT_BENCH_SECS).await;
            Ok(false)
        }
        Err(e) => Err(e.into()),
    }
}

/// Whether the error is a 429 on the channel edit we just made.
fn is_rate_limited(error: &serenity::Error) -> bool {
    matches!(
        error,
        serenity::Error::Http(HttpError::UnsuccessfulRequest(_))
    ) && matches!(
        error,
        serenity::Error::Http(http) if http.status_code() == Some(StatusCode::TOO_MANY_REQUESTS)
    )
}

/// Reads the guild's policy. `None` when the feature is off, so the tick skips the guild entirely.
#[instrument(skip(params), fields(%guild_id))]
async fn load_config(
    params: &SlowmodeWorkerParams,
    guild_id: GuildId,
) -> Result<Option<DynamicSlowmodeConfig>> {
    let settings = get_settings(
        &params.db,
        &params.redis,
        &params.guild_configs_cache,
        guild_id,
    )
    .await?;

    Ok(settings
        .dynamic_slowmode
        .map(|boxed| *boxed)
        .filter(|config| config.enabled))
}

/// Re-reads a channel's live slowmode from Discord, bypassing the stale serenity cache.
///
/// # Errors
/// Returns `Err` if the channel cannot be fetched.
pub async fn live_slowmode(http: &Http, channel_id: ChannelId) -> Result<Option<u16>> {
    let channel = channel_id.to_channel(http).await?;
    Ok(channel.guild().and_then(|c| c.rate_limit_per_user))
}

/// Reconciles every armed channel against Discord's live state.
///
/// Runs once at startup. A live value that no longer matches ours disarms: the bot never fights a moderator.
///
/// # Errors
/// Returns `Err` if the state query or a disarm fails.
pub async fn reconcile_armed_channels(params: &SlowmodeWorkerParams) -> Result<()> {
    let states = database::list_all_armed(&params.db).await?;
    if states.is_empty() {
        return Ok(());
    }

    let mut disarmed = 0_usize;

    for state in states {
        match live_slowmode(params.http.as_ref(), state.channel_id).await {
            Ok(Some(live)) if live == state.last_written_secs => {}
            Ok(Some(live)) => {
                warn!(
                    channel_id = %state.channel_id,
                    expected = state.last_written_secs,
                    actual = live,
                    "slowmode changed outside the bot; disarming channel"
                );
                database::disarm(
                    &params.db,
                    state.channel_id,
                    DisarmReason::HumanEdit.as_str(),
                )
                .await?;
                disarmed += 1;
            }
            Ok(None) => {
                debug!(channel_id = %state.channel_id, "channel no longer supports slowmode; forgetting it");
                database::forget(&params.db, state.channel_id).await?;
            }
            Err(e) => {
                warn!(error = ?e, channel_id = %state.channel_id, "slowmode reconcile read failed");
            }
        }
    }

    info!(disarmed, "dynamic slowmode reconcile finished");
    Ok(())
}
