#![allow(missing_docs)]
use crate::core::config::state::{Context, Error};
use crate::core::setup::ShardManagerContainer;
use fred::interfaces::ClientLike;
use std::time::Instant;
use sysinfo::{ProcessesToUpdate, System};
use tracing::{debug, trace, warn};

/// Pong!
#[poise::command(slash_command)]
pub async fn ping(ctx: Context<'_>) -> Result<(), Error> {
    let caller_id = ctx.author().id.get();
    debug!(caller_id, "Invoked ping diagnostic command");

    let pool = &ctx.data().core.db;
    let redis = &ctx.data().core.redis;
    let data = ctx.serenity_context().data.read().await;

    let shard_manager = if let Some(v) = data.get::<ShardManagerContainer>() { v } else {
        warn!("Failed to retrieve ShardManagerContainer from serenity context data");
        ctx.send(
            poise::CreateReply::default()
                .content("Failed to retrieve shard manager")
                .ephemeral(true),
        )
            .await?;
        return Ok(());
    };

    // Gather all our diagnostics using our helper functions
    let member_count_text = get_member_count_text(&ctx);
    let db_status = check_db_status(pool).await;
    let redis_status = check_redis_status(redis).await;
    let memory_text = get_memory_usage();

    let runners = shard_manager.runners.lock().await;

    let shard_info_text = format!(
        "Instance: {}/{}",
        ctx.data().shard_info.id.0 + 1,
        ctx.data().shard_info.total
    );

    if let Some(runner) = runners.get(&ctx.serenity_context().shard_id) {
        match runner.latency {
            Some(latency) => {
                trace!(
                    latency_ms = latency.as_millis(),
                    "Responding with active gateway latency"
                );
                ctx.say(format!(
                    "Pong!\n{}\n{}\n{}\nDon't forget Moka!\n{}\nMemory Usage: {}\nGateway Latency: {}ms\nWritten in Rust <:OwoFerris:1463892004885758014>",
                    db_status,
                    redis_status,
                    shard_info_text,
                    member_count_text,
                    memory_text,
                    latency.as_millis()
                )).await?;
            }
            None => {
                trace!("Responding without gateway latency (not yet provided by Discord)");
                ctx.say(format!(
                    "Pong!\n{db_status}\n{redis_status}\n{shard_info_text}\nDon't forget Moka!\n{member_count_text}\nMemory Usage: {memory_text}\nGateway Latency: Not **yet** provided by Discord\nWritten in Rust <:OwoFerris:1463892004885758014>",
                )).await?;
            }
        }
    } else {
        warn!(
            shard_id = ?ctx.serenity_context().shard_id,
            "Could not find matching shard runner in shard manager"
        );
        ctx.send(
            poise::CreateReply::default()
                .content("Could not find shard runner.")
                .ephemeral(true),
        )
            .await?;
    }

    Ok(())
}

fn get_member_count_text(ctx: &Context<'_>) -> String {
    if let Some(guild) = ctx.guild() {
        format!("Currently, this guild has {} members", guild.member_count)
    } else {
        trace!("Ping command run in a DM; member count skipped");
        String::from("This is ran in a DM, so member count won't work.")
    }
}

async fn check_db_status(pool: &sqlx::PgPool) -> String {
    let db_start = Instant::now();
    let db_query = sqlx::query("SELECT 1").execute(pool).await;
    let db_latency = db_start.elapsed().as_secs_f64() * 1000.0;

    match db_query {
        Ok(_) => {
            trace!(latency_ms = db_latency, "PostgreSQL database connection is healthy");
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
            trace!(latency_ms = redis_latency, "Redis cache connection is healthy");
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
    if let Ok(pid) = sysinfo::get_current_pid() {
        sys.refresh_processes(ProcessesToUpdate::Some(&[pid]), true);

        if let Some(process) = sys.process(pid) {
            let mem_mb = process.memory() as f64 / 1024.0 / 1024.0;
            format!("{mem_mb:.2} MB")
        } else {
            "Unknown".to_string()
        }
    } else {
        "Unknown".to_string()
    }
}
