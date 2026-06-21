use self::core::setup;
use crate::commands::{emergency, leveling, moderation, ticket};
use commands::{messages, ping};
use poise::serenity_prelude as serenity;
use prost::Message;
use serenity::gateway::ShardManager;
use serenity::prelude::GatewayIntents;
use std::env;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::broadcast;
use tracing::{debug, info, trace, warn};
use types::{Data, Error, LogEvent, SearchUrlsResponse};
use web::start_web_server;

mod commands;
mod core;
mod events;
mod jobs;
mod models;
mod types;
mod utils;
pub mod web;

pub struct ShardManagerContainer;
impl serenity::prelude::TypeMapKey for ShardManagerContainer {
    type Value = Arc<ShardManager>;
}

#[derive(Clone)]
pub struct WebState {
    pub tx: broadcast::Sender<LogEvent>,
    pub pool: sqlx::PgPool,
    pub http: Arc<poise::serenity_prelude::Http>,
    pub redis: redis::aio::MultiplexedConnection,
    pub guild_configs: moka::future::Cache<i64, types::config::config::GuildSettings>,
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    dotenvy::dotenv().ok();

    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .with_target(true)
        .with_line_number(true)
        .init();

    let safe_browsing_api_key: Option<String> = env::var("SAFE_BROWSING_KEY").ok();

    let token = env::var("DISCORD_TOKEN")
        .expect("Expected a token in the environment table, `DISCORD_TOKEN`");
    trace!("Discord token loaded successfully.");

    let database_url = env::var("DATABASE_URL")
        .expect("Expected a database URL in the environment table, `DATABASE_URL`");
    trace!("Database URL loaded successfully.");

    let redis_url =
        env::var("REDIS_URL").expect("Expected a Redis URL in the environment table, `REDIS_URL`");
    trace!("Redis URL loaded successfully.");

    if safe_browsing_api_key.is_some() {
        trace!("Safe Browsing API key loaded successfully.");
    } else {
        warn!("Safe Browsing API key not found. URL checking will be disabled.");
    }

    let run_bot: bool = env::var("RUN_BOT")
        .unwrap_or_else(|_| "true".to_string())
        .parse()
        .unwrap_or(true);

    if run_bot {
        debug!("Since RUN_BOT is true, running discord bot.");
    } else {
        debug!("Since RUN_BOT is false, not running discord bot.");
    }

    let run_web: bool = env::var("RUN_WEB")
        .unwrap_or_else(|_| "true".to_string())
        .parse()
        .unwrap_or(true);

    if run_web {
        debug!("Since RUN_WEB is true, running REST API.");
    } else {
        debug!("Since RUN_WEB is false, not running REST API.");
    }

    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(25)
        .min_connections(5)
        .idle_timeout(Duration::from_secs(30))
        .acquire_timeout(Duration::from_secs(10))
        .connect(&database_url)
        .await?;

    info!(
        "Database connection established! Pool size: {}, Idle: {}",
        pool.size(),
        pool.num_idle()
    );

    let run_migrations = env::var("RUN_MIGRATIONS")
        .unwrap_or_else(|_| "false".to_string())
        .parse()
        .unwrap_or(false);

    if run_migrations {
        info!("Running database migrations...");
        sqlx::migrate!().run(&pool).await?;
        info!("Database migrated successfully.");
    }

    let redis_client = redis::Client::open(redis_url)?;
    debug!("Connected to Redis as {}.", redis_client.get_connection_info().redis_settings().username().unwrap_or("unknown username"));

    let http = Arc::new(serenity::Http::new(&token));

    let guild_configs = moka::future::Cache::new(5000);
    jobs::sync_configs::sync_configs(&redis_client, &guild_configs);

    if run_web {
        let (tx, _) = broadcast::channel::<LogEvent>(1024);

        start_web_server(
            pool.clone(),
            Arc::clone(&http),
            redis_client.clone(),
            guild_configs.clone(),
            tx,
        ).await?;
    }

    let guild_configs_for_setup = guild_configs.clone();

    if run_bot {
        let intents = GatewayIntents::GUILDS
            | GatewayIntents::GUILD_MESSAGES
            | GatewayIntents::DIRECT_MESSAGES
            | GatewayIntents::MESSAGE_CONTENT
            | GatewayIntents::GUILD_MEMBERS
            | GatewayIntents::GUILD_MESSAGE_REACTIONS
            | GatewayIntents::GUILD_MODERATION;

        let active_names: Vec<&str> = intents
            .iter_names()
            .map(|(name, _flag)| name)
            .collect();

        info!("Selected intents: {:?}", active_names);

        let mut cache_settings = serenity::cache::Settings::default();
        cache_settings.max_messages = 5;
        cache_settings.cache_users = false;
        cache_settings.cache_channels = false;
        cache_settings.time_to_live = Duration::from_secs(60 * 30);

        debug!(
            max_messages = cache_settings.max_messages,
            cache_users = cache_settings.cache_users,
            cache_channels = cache_settings.cache_channels,
            cache_guilds = cache_settings.cache_guilds,
            ttl = cache_settings.time_to_live.as_secs(),
            "Setting up cache",
        );

        let commands_to_register = vec![
            ping::ping(),
            moderation::others::commands::purge(),
            moderation::others::commands::kick(),
            moderation::others::commands::ban(),
            moderation::others::commands::mute(),
            moderation::others::commands::unmute(),
            moderation::others::commands::softban(),
            moderation::others::commands::unban(),
            moderation::warn::commands::warn(),
            moderation::warn::commands::warn_history(),
            moderation::warn::commands::search_warnings(),
            moderation::warn::commands::search_warning_by_id(),
            moderation::warn::commands::pardon_warning(),
            moderation::warn::commands::unpardon_warning(),
            moderation::warn::commands::delete_warning(),
            messages::commands::deleted_history(),
            messages::commands::edit_history(),
            messages::commands::report_message(),
            leveling::level(),
            emergency::lock(),
            emergency::unlock(),
            emergency::global_lock(),
            emergency::global_unlock(),
            ticket::setup_tickets(),
            register(),
        ];

        info!("Registered {} commands", commands_to_register.len());

        let framework = poise::Framework::builder()
            .options(poise::FrameworkOptions {
                prefix_options: poise::PrefixFrameworkOptions {
                    prefix: Some("!".into()),
                    edit_tracker: Some(Arc::new(poise::EditTracker::for_timespan(
                        Duration::from_secs(3600),
                    ))),
                    ..Default::default()
                },
                commands: commands_to_register,
                on_error: |error| Box::pin(utils::error::on_error(error)),
                event_handler: |ctx, event, framework, data| {
                    Box::pin(events::events::event_handler(ctx, event, framework, data))
                },
                ..Default::default()
            })
            .setup(move |ctx, _ready, _framework| {
                setup::setup(safe_browsing_api_key, pool, redis_client.clone(), guild_configs_for_setup.clone(), ctx, _ready)
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

        info!("Starting Shard {} of {}...", shard_index + 1, total_shards);

        client.start_shard(shard_index, total_shards).await?;
    } else {
        warn!("Bot Gateway client is disabled. Web server running exclusively. Ignore this warning if this is intentional.");
        tokio::signal::ctrl_c().await?;
    }

    Ok(())
}

#[poise::command(prefix_command, owners_only, hide_in_help)]
async fn register(ctx: poise::Context<'_, Data, Error>) -> Result<(), Error> {
    poise::builtins::register_application_commands_buttons(ctx).await?;
    Ok(())
}