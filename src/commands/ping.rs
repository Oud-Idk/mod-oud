use crate::types::{Context, Error};
use crate::ShardManagerContainer;
use fred::prelude::ClientLike;
use std::time::Instant;
use sysinfo::{ProcessesToUpdate, System};
use tracing::{debug, trace, warn};

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
            format!("PostgreSQL connection is healthy ({:.2}ms).", db_latency)
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
            format!("Redis connection is healthy ({:.2}ms).", redis_latency)
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
            format!("{:.2} MB", mem_mb)
        } else {
            "Unknown".to_string()
        }
    } else {
        "Unknown".to_string()
    }
}


/// Pong!
#[poise::command(slash_command)]
pub async fn ping(ctx: Context<'_>) -> Result<(), Error> {
    let caller_id = ctx.author().id.get();
    debug!(caller_id, "Invoked ping diagnostic command");

    let pool = &ctx.data().db;
    let redis = &ctx.data().redis;
    let data = ctx.serenity_context().data.read().await;

    let shard_manager = match data.get::<ShardManagerContainer>() {
        Some(v) => v,
        None => {
            warn!("Failed to retrieve ShardManagerContainer from serenity context data");
            ctx.send(
                poise::CreateReply::default()
                    .content("Failed to retrieve shard manager")
                    .ephemeral(true),
            )
                .await?;
            return Ok(());
        }
    };

    // Gather all our diagnostics using our helper functions
    let member_count_text = get_member_count_text(&ctx);
    let db_status = check_db_status(pool).await;
    let redis_status = check_redis_status(redis).await;
    let memory_text = get_memory_usage();

    let runners = shard_manager.runners.lock().await;

    if let Some(runner) = runners.get(&ctx.serenity_context().shard_id) {
        match runner.latency {
            Some(latency) => {
                trace!(
                    latency_ms = latency.as_millis(),
                    "Responding with active gateway latency"
                );
                ctx.say(format!(
                    "Pong!\n{}\n{}\nDon't forget Moka!\n{}\nMemory Usage: {}\nGateway Latency: {}ms\nWritten in Rust <:OwoFerris:1463892004885758014>",
                    db_status,
                    redis_status,
                    member_count_text,
                    memory_text,
                    latency.as_millis()
                )).await?;
            }
            None => {
                trace!("Responding without gateway latency (not yet provided by Discord)");
                ctx.say(format!(
                    "Pong!\n{}\n{}\nDon't forget Moka!\n{}\nMemory Usage: {}\nGateway Latency: Not **yet** provided by Discord\nWritten in Rust <:OwoFerris:1463892004885758014>",
                    db_status,
                    redis_status,
                    member_count_text,
                    memory_text,
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