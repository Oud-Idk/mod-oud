#![allow(missing_docs, clippy::unused_async)]
use crate::core::config::state::{Context, Error};
use crate::core::setup::ShardManagerContainer;
use anyhow::anyhow;
use fred::interfaces::ClientLike;
use std::fmt;
use std::time::Duration;
use std::time::Instant;
use sysinfo::{ProcessesToUpdate, System};
use tracing::{debug, trace, warn};

/// Holds all gathered diagnostic metrics to separate data collection from presentation.
struct DiagnosticReport<'a> {
    db_status: &'a str,
    redis_status: &'a str,
    shard_id: u32,
    total_shards: u32,
    member_count: Option<u64>,
    memory_usage: &'a str,
    gateway_latency: Option<Duration>,
}

impl fmt::Display for DiagnosticReport<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let latency_display = self.gateway_latency.map_or_else(
            || "Not **yet** provided by Discord".to_string(),
            |l| format!("{}ms", l.as_millis()),
        );

        let member_display = get_member_count_text(self.member_count);

        write!(
            f,
            "Pong!\n\
             {db}\n\
             {redis}\n\
             Instance: {instance}/{total}\n\
             Don't forget Moka!\n\
             {members}\n\
             Memory Usage: {memory}\n\
             Gateway Latency: {latency}\n\
             Written in Rust <:OwoFerris:1463892004885758014>",
            db = self.db_status,
            redis = self.redis_status,
            instance = self.shard_id + 1,
            total = self.total_shards,
            members = member_display,
            memory = self.memory_usage,
            latency = latency_display,
        )
    }
}

/// Pong!
#[poise::command(slash_command)]
pub async fn ping(ctx: Context<'_>) -> Result<(), Error> {
    debug!(
        caller_id = ctx.author().id.get(),
        "Invoked ping diagnostic command"
    );

    let gateway_latency = fetch_shard_latency(&ctx).await?;
    let pool = &ctx.data().core.db;
    let redis = &ctx.data().core.redis;

    let (db_status, redis_status) = tokio::join!(check_db_status(pool), check_redis_status(redis));

    let memory_usage = get_memory_usage();

    let report = DiagnosticReport {
        db_status: &db_status,
        redis_status: &redis_status,
        shard_id: ctx.data().shard_info.id.0,
        total_shards: ctx.data().shard_info.total,
        member_count: ctx.guild().as_ref().map(|g| g.member_count),
        memory_usage: &memory_usage,
        gateway_latency,
    };

    trace!(
        latency_ms = gateway_latency.map(|l| l.as_millis()),
        "Responding to ping command"
    );

    ctx.say(report.to_string()).await?;
    Ok(())
}

async fn fetch_shard_latency(ctx: &Context<'_>) -> Result<Option<Duration>, Error> {
    let shard_manager = {
        let data = ctx.serenity_context().data.read().await;
        data.get::<ShardManagerContainer>().cloned()
    };

    let shard_manager = shard_manager.ok_or_else(|| anyhow!("Missing shard manager."))?;

    let latency = {
        let runners = shard_manager.runners.lock().await;
        runners
            .get(&ctx.serenity_context().shard_id)
            .map(|r| r.latency)
    };

    latency.ok_or_else(|| anyhow!("Runner not found."))
}

fn get_member_count_text(count: Option<u64>) -> String {
    count.map_or_else(
        || String::from("This is ran in a DM, so member count won't work."),
        |c| format!("Currently, this guild has {c} members"),
    )
}

async fn check_db_status(pool: &sqlx::PgPool) -> String {
    let db_start = Instant::now();
    let db_query = sqlx::query("SELECT 1").execute(pool).await;
    let db_latency = db_start.elapsed().as_secs_f64() * 1000.0;

    match db_query {
        Ok(_) => {
            trace!(
                latency_ms = db_latency,
                "PostgreSQL database connection is healthy"
            );
            format!("PostgreSQL connection is healthy (`SELECT 1` yields {db_latency:.2}ms).")
        }
        Err(err) => {
            warn!(error = ?err, "PostgreSQL database connection check failed");
            String::from("PostgreSQL connection failed.")
        }
    }
}

async fn check_redis_status(redis: &fred::clients::Client) -> String {
    let redis_start = Instant::now();
    let redis_ping: Result<String, _> = redis.ping(None).await;
    let redis_latency = redis_start.elapsed().as_secs_f64() * 1000.0;

    match redis_ping {
        Ok(_) => {
            trace!(
                latency_ms = redis_latency,
                "Redis cache connection is healthy"
            );
            format!("Redis connection is healthy (`PING` yields {redis_latency:.2}ms).")
        }
        Err(err) => {
            warn!(error = ?err, "Redis cache connection check failed");
            String::from("Redis connection failed.")
        }
    }
}

/// Retrieves the current process memory usage.
fn get_memory_usage() -> String {
    let mut sys = System::new();
    sysinfo::get_current_pid().map_or_else(
        |_| "Unknown".to_string(),
        |pid| {
            sys.refresh_processes(ProcessesToUpdate::Some(&[pid]), true);

            sys.process(pid).map_or_else(
                || "Unknown".to_string(),
                |process| {
                    #[expect(clippy::cast_precision_loss, reason = "Memory won't exceed 8 PiB")]
                    let mem_mb = process.memory() as f64 / 1024.0 / 1024.0;
                    format!("{mem_mb:.2} MB")
                },
            )
        },
    )
}
