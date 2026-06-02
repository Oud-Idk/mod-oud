use crate::{Context, Error, ShardManagerContainer};

/// Pong!
#[poise::command(slash_command)]
pub async fn ping(ctx: Context<'_>) -> Result<(), Error> {
    let pool = &ctx.data().db;
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

    let runners = shard_manager.runners.lock().await;

    let db_status = match sqlx::query("SELECT 1").execute(pool).await {
        Ok(_) => "PostgreSQL connection is healthy.",
        Err(_) => "PostgreSQL connection failed. For some reason.",
    };

    if let Some(runner) = runners.get(&ctx.serenity_context().shard_id) {
        match runner.latency {
            Some(latency) => {
                ctx.say(format!("Pong!\n{}\nGateway Latency: {}ms\nWritten in Rust <:OwoFerris:1463892004885758014>", db_status, latency.as_millis())).await?;
            }
            None => {
                ctx.say(format!(
                    "Pong!\n{}\nWritten in Rust <:OwoFerris:1463892004885758014>",
                    db_status
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
