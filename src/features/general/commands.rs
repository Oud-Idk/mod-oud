#![allow(missing_docs, clippy::unused_async)]
use super::telemetry::{
    DatabaseTelemetry, MemoryTelemetry, RedisTelemetry, ShardTelemetry, TelemetryReport,
    probe_database, probe_memory, probe_redis,
};
use crate::core::config::state::{Context, Error};
use crate::core::setup::ShardManagerContainer;
use anyhow::anyhow;
use std::fmt;
use std::time::Duration;
use tracing::debug;

/// Holds gathered telemetry along with Discord interaction context for display formatting.
struct PingDisplayReport<'a> {
    telemetry: &'a TelemetryReport,
    member_count: Option<u64>,
}

fn format_db_status(db: &DatabaseTelemetry) -> String {
    if db.healthy {
        let latency = db.latency_ms.unwrap_or(0.0);
        format!("PostgreSQL connection is healthy (`SELECT 1` yields {latency:.2}ms).")
    } else {
        "PostgreSQL connection failed.".to_string()
    }
}

fn format_redis_status(redis: &RedisTelemetry) -> String {
    if redis.healthy {
        let latency = redis.latency_ms.unwrap_or(0.0);
        format!("Redis connection is healthy (`PING` yields {latency:.2}ms).")
    } else {
        "Redis connection failed.".to_string()
    }
}

fn format_memory_status(mem: &MemoryTelemetry) -> (String, String) {
    let shard = mem
        .bot_mb
        .map_or_else(|| "Unknown".to_string(), |mb| format!("{mb:.2} MB"));
    let ml = mem
        .ml_mb
        .map_or_else(|| "offline/not found".to_string(), |mb| format!("{mb:.2} MB"));
    (shard, ml)
}

fn format_gateway_latency(shard: Option<&ShardTelemetry>) -> String {
    shard
        .and_then(|s| s.gateway_latency_ms)
        .map_or_else(
            || "Not **yet** provided by Discord".to_string(),
            |ms| format!("{ms}ms"),
        )
}

fn get_member_count_text(count: Option<u64>) -> String {
    count.map_or_else(String::new, |c| {
        format!("Currently, this guild has {c} members")
    })
}

impl fmt::Display for PingDisplayReport<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let db_display = format_db_status(&self.telemetry.database);
        let redis_display = format_redis_status(&self.telemetry.redis);
        let (shard_memory, ml_memory) = format_memory_status(&self.telemetry.memory);
        let latency_display = format_gateway_latency(self.telemetry.shard.as_ref());
        let member_display = get_member_count_text(self.member_count);

        let instance = self
            .telemetry
            .shard
            .as_ref()
            .map_or(1, |s| s.shard_id + 1);
        let total = self.telemetry.shard.as_ref().map_or(1, |s| s.total_shards);

        write!(
            f,
            "Pong!\n\
             {db_display}\n\
             {redis_display}\n\
             Instance: {instance}/{total}\n\
             {member_display}\n\
             Shard Memory Usage: {shard_memory}\n\
             ML Memory Usage: {ml_memory}\n\
             Gateway Latency: {latency_display}\n\
             Written in Rust <:OwoFerris:1463892004885758014>",
        )
    }
}

/// Pong!
#[poise::command(slash_command)]
pub async fn ping(ctx: Context<'_>) -> Result<(), Error> {
    let gateway_latency = fetch_shard_latency(&ctx).await?;
    let pool = &ctx.data().core.db;
    let redis = &ctx.data().core.redis;

    let (database, redis) = tokio::join!(probe_database(pool), probe_redis(redis));
    let memory = probe_memory();

    #[expect(clippy::cast_possible_truncation, reason = "Duration millis fits u64")]
    let shard = Some(ShardTelemetry {
        shard_id: ctx.data().shard_info.id.0,
        total_shards: ctx.data().shard_info.total,
        gateway_latency_ms: gateway_latency.map(|l| l.as_millis() as u64),
    });

    let telemetry = TelemetryReport {
        database,
        redis,
        memory,
        shard,
    };

    let display_report = PingDisplayReport {
        telemetry: &telemetry,
        member_count: ctx.guild().as_ref().map(|g| g.member_count),
    };

    ctx.say(display_report.to_string()).await?;

    debug!(
        latency_ms = gateway_latency.map(|l| l.as_millis()),
        "ping reply sent"
    );
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
