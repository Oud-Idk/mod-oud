use crate::commands::{emergency, ticket};
use crate::models::spam_tracker::SpamTracker;
use commands::{config, messages, moderation, ping, warn};
use poise::serenity_prelude as serenity;
use serenity::gateway::ShardManager;
use serenity::prelude::GatewayIntents;
use std::env;
use std::sync::Arc;
use types::{Data, Error};

mod commands;
mod core;
mod events;
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
    let redis_url =
        env::var("REDIS_URL").expect("Expected a Redis URL in the environment table, `REDIS_URL`");

    let _ = env::var("SAFE_BROWSING_KEY").unwrap_or_else(|_| {
        eprintln!("Safe browsing API key not found. Scam detection will not work");
        "".to_owned()
    });

    // Initialize the database connection pool
    let pool = sqlx::PgPool::connect(&database_url).await?;
    let redis_client = redis::Client::open(redis_url)?;

    let intents = GatewayIntents::GUILDS
        | GatewayIntents::GUILD_MESSAGES
        | GatewayIntents::DIRECT_MESSAGES
        | GatewayIntents::MESSAGE_CONTENT
        | GatewayIntents::GUILD_MEMBERS;

    let mut cache_settings = serenity::cache::Settings::default();
    cache_settings.max_messages = 100;

    let framework = poise::Framework::builder()
        .options(poise::FrameworkOptions {
            prefix_options: poise::PrefixFrameworkOptions {
                prefix: Some("!".into()),
                edit_tracker: Some(Arc::new(poise::EditTracker::for_timespan(
                    std::time::Duration::from_secs(3600),
                ))),
                ..Default::default()
            },
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
                register(),
            ],
            on_error: |error| Box::pin(utils::error::on_error(error)),
            event_handler: |ctx, event, framework, data| {
                Box::pin(utils::events::event_handler(ctx, event, framework, data))
            },
            ..Default::default()
        })
        .setup(move |ctx, _ready, _framework| {
            Box::pin(async move {
                println!("Logged in as {}", _ready.user.name);

                // Start background worker threads
                jobs::temp_ban::start_temp_ban_worker(pool.clone(), ctx.http.clone());

                // Start our new centralized ticket monitor worker!
                jobs::ticket_inactivity::start_ticket_inactivity_worker(
                    pool.clone(),
                    ctx.http.clone(),
                );

                let spam_tracker = SpamTracker::new(redis_client.clone());

                // Return initialized state data (Clean and Stateless!)
                Ok(Data {
                    db: pool,
                    redis: redis_client,
                    spam_tracker,
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

    let shard_index: u32 = env::var("SHARD_INDEX")
        .unwrap_or_else(|_| "0".to_string())
        .parse()
        .expect("SHARD_INDEX must be a valid u32");

    let total_shards: u32 = env::var("TOTAL_SHARDS")
        .unwrap_or_else(|_| "1".to_string())
        .parse()
        .expect("TOTAL_SHARDS must be a valid u32");

    println!("Starting Shard {} of {}...", shard_index, total_shards);

    // 3. Instead of client.start().await?, boot only the assigned shard
    client.start_shard(shard_index, total_shards).await?;

    Ok(())
}

#[poise::command(prefix_command, owners_only, hide_in_help)]
async fn register(ctx: poise::Context<'_, Data, Error>) -> Result<(), Error> {
    poise::builtins::register_application_commands_buttons(ctx).await?;
    Ok(())
}
