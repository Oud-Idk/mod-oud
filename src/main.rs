use crate::commands::{emergency, ticket};
use commands::{config, messages, moderation, ping, warn};
use core::setup::restore_active_tickets;
use models::spam_tracker::SpamTracker;
use poise::serenity_prelude as serenity;
use serenity::all::ChannelId;
use serenity::gateway::ShardManager;
use serenity::prelude::GatewayIntents;
use std::collections::HashMap;
use std::env;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::time::Instant;
use types::{Data, Error, TicketInfo};

mod commands;
mod core;
mod event_handlers;
mod jobs;
mod models;
mod types;
mod utils;

pub struct ShardManagerContainer;
impl serenity::prelude::TypeMapKey for ShardManagerContainer {
    type Value = Arc<ShardManager>;
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    dotenvy::dotenv().ok();

    let token = env::var("DISCORD_TOKEN")
        .expect("Expected a token in the environment table, `DISCORD_TOKEN`");
    let database_url = env::var("DATABASE_URL")
        .expect("Expected a database URL in the environment table, `DATABASE_URL`");

    // Initialize the database connection pool
    let pool = sqlx::PgPool::connect(&database_url).await?;

    // Run pending migrations automatically
    sqlx::migrate!("./migrations").run(&pool).await?;

    let intents = GatewayIntents::GUILDS
        | GatewayIntents::GUILD_MESSAGES
        | GatewayIntents::DIRECT_MESSAGES
        | GatewayIntents::MESSAGE_CONTENT
        | GatewayIntents::GUILD_MEMBERS;

    let mut cache_settings = serenity::cache::Settings::default();
    cache_settings.max_messages = 100;

    let framework = poise::Framework::builder()
        .options(poise::FrameworkOptions {
            commands: vec![
                ping::ping(),
                moderation::purge(),
                moderation::kick(),
                moderation::ban(),
                moderation::mute(),
                moderation::unmute(),
                moderation::softban(),
                warn::warn(),
                warn::search_warning_by_id(),
                warn::warn_history(),
                warn::pardon_warning(),
                warn::unpardon_warning(),
                warn::delete_warning(),
                warn::search_warnings(),
                messages::deleted_history(),
                messages::edit_history(),
                emergency::lock(),
                emergency::unlock(),
                emergency::global_lock(),
                emergency::global_unlock(),
                ticket::setup_tickets(),
                config::config(),
            ],
            on_error: |error| Box::pin(utils::error::on_error(error)),
            event_handler: |ctx, event, framework, data| {
                Box::pin(utils::events::event_handler(ctx, event, framework, data))
            },
            ..Default::default()
        })
        .setup(|ctx, _ready, framework| {
            Box::pin(async move {
                println!("Logged in as {}", _ready.user.name);

                // 1. Register application commands
                poise::builtins::register_globally(ctx, &framework.options().commands).await?;

                // 2. Start background worker threads
                jobs::temp_ban::start_temp_ban_worker(pool.clone(), ctx.http.clone());

                // 3. Restore database states
                let active_tickets = restore_active_tickets(ctx, &pool).await?;

                // 4. Return initialized state data
                Ok(Data {
                    db: pool,
                    spam_tracker: SpamTracker::new(),
                    active_tickets,
                })
            })
        })
        .build();

    let mut client = serenity::Client::builder(token, intents)
        .framework(framework)
        .cache_settings(cache_settings)
        .await?;

    {
        let mut data = client.data.write().await;
        data.insert::<ShardManagerContainer>(Arc::clone(&client.shard_manager));
    }

    client.start().await?;

    Ok(())
}
