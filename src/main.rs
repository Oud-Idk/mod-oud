use fred::clients::SubscriberClient;
use fred::prelude::*;
use mod_oud::core::config;
use mod_oud::core::error::on_error;
use mod_oud::core::setup::{ShardManagerContainer, setup};
use mod_oud::features::live_feed::LogEvent;
use mod_oud::features::{automod, birthday, custom_commands, general, invite_tracking, leveling, media_only, member_counter, moderation, music, raid_detection, reporting, temp_voice, tickets, warning};
use mod_oud::web::server::start_web_server;
use mod_oud::{events, Data, Error, UserUpdate};
use poise::serenity_prelude as serenity;
use serenity::prelude::GatewayIntents;
use sqlx::ConnectOptions;
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use std::env;
use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;
use fred::rustls;
use songbird::SerenityInit;
use tokio::sync::{broadcast, mpsc};
use tracing::log::LevelFilter;
use tracing::{debug, info, trace, warn};

fn main() -> Result<(), Error> {
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .thread_stack_size(4 * 1024 * 1024)
        .build()?;

    runtime.block_on(async_main())
}

async fn async_main() -> Result<(), Error> {
    let _ = rustls::crypto::ring::default_provider().install_default();
    dotenvy::dotenv().ok();

    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .pretty()
        .with_target(true)
        .with_line_number(true)
        .with_file(true)
        .with_thread_names(true)
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

    let connection_options = PgConnectOptions::from_str(&database_url)?
        .log_statements(LevelFilter::Debug)
        .log_slow_statements(LevelFilter::Warn, Duration::from_millis(100));

    let pool = PgPoolOptions::new()
        .max_connections(25)
        .min_connections(5)
        .idle_timeout(Duration::from_secs(30))
        .acquire_timeout(Duration::from_secs(10))
        .connect_with(connection_options)
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

    let redis_config = Config::from_url(&redis_url)?;
    let redis_client = Builder::from_config(redis_config)
        .with_config(|config| {
            config.tracing.enabled = true;
            config.tracing.default_tracing_level = tracing::Level::DEBUG;
        })
        .build()?;
    redis_client.init().await?;
    debug!("Connected to Redis as {}.", redis_client.client_config().username.as_deref().unwrap_or("default"));

    let subscriber_config = Config::from_url(&redis_url)?;
    let subscriber_client: SubscriberClient = Builder::from_config(subscriber_config)
        .with_config(|config| {
            config.tracing.enabled = true;
            config.tracing.default_tracing_level = tracing::Level::DEBUG;
        })
        .build_subscriber_client()?;
    subscriber_client.init().await?;
    subscriber_client.manage_subscriptions();
    debug!("Connected to Redis with Subscriber as {}.", subscriber_client.client_config().username.as_deref().unwrap_or("default"));

    let reqwest_client = reqwest::Client::new();

    let http = Arc::new(serenity::Http::new(&token));

    let guild_configs = moka::future::Cache::new(5000);
    config::sync::sync_configs(&subscriber_client, &guild_configs);

    let (username_tx, username_rx) = mpsc::channel::<UserUpdate>(5000);

    if run_web {
        let (tx, _) = broadcast::channel::<LogEvent>(1024);

        start_web_server(
            pool.clone(),
            Arc::clone(&http),
            redis_client.clone(),
            subscriber_client.clone(),
            guild_configs.clone(),
            tx,
            reqwest_client.clone(),
            username_tx.clone(),
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
            | GatewayIntents::GUILD_MODERATION
            | GatewayIntents::GUILD_VOICE_STATES;

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
            general::ping(),
            moderation::purge(),
            moderation::kick(),
            moderation::ban(),
            moderation::mute(),
            moderation::unmute(),
            moderation::softban(),
            moderation::unban(),
            moderation::delete_category(),
            warning::warn(),
            warning::warnings(),
            reporting::report_message(),
            leveling::level(),
            moderation::lock(),
            moderation::unlock(),
            moderation::global_lock(),
            moderation::global_unlock(),
            tickets::setup_tickets(),
            invite_tracking::invites(),
            invite_tracking::inviter(),
            invite_tracking::invites_leaderboard(),
            custom_commands::custom_commands(),
            raid_detection::raid(),
            birthday::birthday(),
            automod::honeypot(),
            temp_voice::voice(),
            member_counter::counters(),
            media_only::media_only(),
            music::music(),
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
                on_error: |error| Box::pin(on_error(error)),
                event_handler: |ctx, event, framework, data| {
                    Box::pin(events::dispatch::dispatch_events(ctx, event, framework, data))
                },
                ..Default::default()
            })
            .setup(move |ctx, _ready, _framework| {
                setup(safe_browsing_api_key, pool, redis_client.clone(), subscriber_client.clone(), guild_configs_for_setup.clone(), ctx, username_tx.clone(), username_rx, reqwest_client.clone(), _ready)
            })
            .build();

        let mut client = serenity::Client::builder(token, intents)
            .framework(framework)
            .cache_settings(cache_settings)
            .register_songbird()
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