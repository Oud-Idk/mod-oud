use crate::types::types::{Context, Error};
use crate::ShardManagerContainer;

/// Pong!
#[poise::command(slash_command)]
pub async fn ping(ctx: Context<'_>) -> Result<(), Error> {
    let pool = &ctx.data().db;
    let redis = &ctx.data().redis; // MultiplexedConnection
    let data = ctx.serenity_context().data.read().await;
    let shard_manager = match data.get::<ShardManagerContainer>() {
        Some(v) => v,
        None => {
            ctx.send(
                poise::CreateReply::default()
                    .content("Failed to retrieve shard manager")
                    .ephemeral(true),
            )
                .await?;
            return Ok(());
        }
    };

    let member_count_text: String;

    if let Some(guild) = ctx.guild() {
        member_count_text = format!("Currently, this guild has {} members", guild.member_count);
    } else {
        member_count_text = String::from("This is ran in a DM, so member count won't work.");
    }

    let runners = shard_manager.runners.lock().await;

    // PostgreSQL Check
    let db_status = match sqlx::query("SELECT 1").execute(pool).await {
        Ok(_) => "PostgreSQL connection is healthy.",
        Err(_) => "PostgreSQL connection failed.",
    };

    // Redis Check
    let mut redis_conn = redis.clone();
    let redis_ping: Result<String, _> = redis::cmd("PING").query_async(&mut redis_conn).await;

    let redis_status = match redis_ping {
        Ok(_) => "Redis connection is healthy.",
        Err(_) => "Redis connection failed.",
    };

    if let Some(runner) = runners.get(&ctx.serenity_context().shard_id) {
        match runner.latency {
            Some(latency) => {
                ctx.say(format!(
                    "Pong!\n{}\n{}\n{}\nGateway Latency: {}ms\nWritten in Rust <:OwoFerris:1463892004885758014>",
                    db_status,
                    redis_status,
                    member_count_text,
                    latency.as_millis()
                )).await?;
            }
            None => {
                ctx.say(format!(
                    "Pong!\n{}\n{}\n{}\nGateway Latency: Here's the thing. It's not **yet** provided by Discord.\nWritten in Rust <:OwoFerris:1463892004885758014>",
                    db_status,
                    redis_status,
                    member_count_text,
                ))
                    .await?;
            }
        }
    } else {
        ctx.send(
            poise::CreateReply::default()
                .content("Could not find shard runner.")
                .ephemeral(true),
        )
            .await?;
    }

    Ok(())
}