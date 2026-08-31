//! Mod Oud bot binary: builds the config, starts the poise framework, and
//! launches the bot along with the web dashboard server.

use fred::clients::SubscriberClient;
use fred::prelude::*;
use fred::rustls;
use mod_oud::core::config;
use mod_oud::core::config::settings::GuildSettings;
use mod_oud::core::config::state::{BotData, Error};
use mod_oud::core::error::on_error;
use mod_oud::core::setup::SetupParams;
use mod_oud::core::setup::{ShardManagerContainer, setup};
use mod_oud::events;
use mod_oud::features::bad_words::CompiledRuleset;
use mod_oud::features::live_feed::LogEvent;
use mod_oud::features::music::MusicState;
use mod_oud::features::music::WebCommandBus;
use mod_oud::features::{
    automod, birthday, custom_commands, economy, general, invite_tracking, leveling, media_only,
    member_counter, moderation, music, raid_detection, reporting, search, temp_voice, tickets,
    warning,
};
use mod_oud::shared::spotify_auth::SpotifyAuthCache;
use mod_oud::shared::username_cache::UserUpdate;
use mod_oud::web::server::{WebServerDeps, start_web_server};
use poise::serenity_prelude as serenity;
use serenity::prelude::GatewayIntents;
use songbird::SerenityInit;
use sqlx::ConnectOptions;
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use std::env;
use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;
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
    init_logging();

    let env_config = load_env();
    let pool = connect_database(&env_config.database_url, env_config.run_migrations).await?;
    let (redis_client, subscriber_client) = connect_redis(&env_config.redis_url).await?;

    let reqwest_client = reqwest::Client::new();

    let http = Arc::new(serenity::Http::new(&env_config.token));

    let guild_configs = moka::future::Cache::new(5000);
    let bad_words_cache = moka::future::Cache::new(10_000);
    config::sync::sync_configs(&subscriber_client, &guild_configs, &bad_words_cache);

    let (username_tx, username_rx) = mpsc::channel::<UserUpdate>(5000);

    let (music_stats_tx, music_stats_rx) = mpsc::unbounded_channel();
    music::start_music_stats_worker(pool.clone(), music_stats_rx);
    let spotify_auth = Arc::new(SpotifyAuthCache::new());
    let music_state = MusicState::new(
        music_stats_tx,
        env_config.google_cloud_api_key.clone(),
        spotify_auth.clone(),
        redis_client.clone(),
    );

    // Forwards Redis now-playing events into the local broadcast channel so
    // dashboard WebSockets receive updates regardless of where the actor runs.
    music::start_music_event_bridge(subscriber_client.clone(), music_state.events_tx.clone());

    if env_config.run_web {
        let (tx, _) = broadcast::channel::<LogEvent>(1024);
        let web_command_bus = WebCommandBus::new(redis_client.clone(), subscriber_client.clone());

        start_web_server(WebServerDeps {
            db: pool.clone(),
            http: Arc::clone(&http),
            redis_client: redis_client.clone(),
            subscriber_client: subscriber_client.clone(),
            guild_configs: guild_configs.clone(),
            tx,
            reqwest_client: reqwest_client.clone(),
            username_tx: username_tx.clone(),
            web_commands: web_command_bus,
            music_state: music_state.clone(),
        })
        .await?;
    }

    if env_config.run_bot {
        start_bot(BotDeps {
            token: env_config.token,
            google_cloud_api_key: env_config.google_cloud_api_key,
            pool,
            redis_client,
            subscriber_client,
            guild_configs,
            bad_words_cache,
            username_tx,
            username_rx,
            reqwest_client,
            music_state,
        })
        .await?;
    } else {
        warn!(
            "Bot Gateway client is disabled. Web server running exclusively. Ignore this warning if this is intentional."
        );
        tokio::signal::ctrl_c().await?;
    }

    Ok(())
}

/// Environment variables parsed at startup.
struct EnvConfig {
    token: String,
    database_url: String,
    redis_url: String,
    google_cloud_api_key: String,
    run_bot: bool,
    run_web: bool,
    run_migrations: bool,
}

/// Dependencies required to start the Discord bot gateway client.
struct BotDeps {
    token: String,
    google_cloud_api_key: String,
    pool: sqlx::PgPool,
    redis_client: Client,
    subscriber_client: SubscriberClient,
    guild_configs: moka::future::Cache<serenity::all::GuildId, GuildSettings>,
    bad_words_cache: moka::future::Cache<serenity::all::GuildId, Arc<Vec<CompiledRuleset>>>,
    username_tx: mpsc::Sender<UserUpdate>,
    username_rx: mpsc::Receiver<UserUpdate>,
    reqwest_client: reqwest::Client,
    music_state: MusicState,
}

/// Installs the rustls crypto provider, loads `.env`, and initializes tracing.
fn init_logging() {
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
}

/// Reads all environment configuration into an [`EnvConfig`].
fn load_env() -> EnvConfig {
    let token = env::var("DISCORD_TOKEN")
        .expect("Expected a token in the environment table, `DISCORD_TOKEN`");
    trace!("Discord token loaded successfully.");

    let database_url = env::var("DATABASE_URL")
        .expect("Expected a database URL in the environment table, `DATABASE_URL`");
    trace!("Database URL loaded successfully.");

    let redis_url =
        env::var("REDIS_URL").expect("Expected a Redis URL in the environment table, `REDIS_URL`");
    trace!("Redis URL loaded successfully.");

    let google_cloud_api_key = env::var("GOOGLE_CLOUD_API_KEY")
        .expect("Expected a Google Cloud API key in the environment table, `GOOGLE_CLOUD_API_KEY`");
    trace!("Google Cloud API Key loaded successfully.");

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

    let run_migrations = env::var("RUN_MIGRATIONS")
        .unwrap_or_else(|_| "false".to_string())
        .parse()
        .unwrap_or(false);

    EnvConfig {
        token,
        database_url,
        redis_url,
        google_cloud_api_key,
        run_bot,
        run_web,
        run_migrations,
    }
}

/// Connects to `PostgreSQL` and optionally runs pending migrations.
async fn connect_database(database_url: &str, run_migrations: bool) -> Result<sqlx::PgPool, Error> {
    let connection_options = PgConnectOptions::from_str(database_url)?
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

    if run_migrations {
        info!("Running database migrations...");
        sqlx::migrate!().run(&pool).await?;
        info!("Database migrated successfully.");
    }

    Ok(pool)
}

/// Connects to Redis, returning the regular and subscriber clients.
async fn connect_redis(redis_url: &str) -> Result<(Client, SubscriberClient), Error> {
    let redis_config = Config::from_url(redis_url)?;
    let redis_client = Builder::from_config(redis_config)
        .with_config(|config| {
            config.tracing.enabled = true;
            config.tracing.default_tracing_level = tracing::Level::DEBUG;
        })
        .build()?;
    redis_client.init().await?;
    debug!(
        "Connected to Redis as {}.",
        redis_client
            .client_config()
            .username
            .as_deref()
            .unwrap_or("default")
    );

    let subscriber_config = Config::from_url(redis_url)?;
    let subscriber_client: SubscriberClient = Builder::from_config(subscriber_config)
        .with_config(|config| {
            config.tracing.enabled = true;
            config.tracing.default_tracing_level = tracing::Level::DEBUG;
        })
        .build_subscriber_client()?;
    subscriber_client.init().await?;
    subscriber_client.manage_subscriptions();
    debug!(
        "Connected to Redis with Subscriber as {}.",
        subscriber_client
            .client_config()
            .username
            .as_deref()
            .unwrap_or("default")
    );

    Ok((redis_client, subscriber_client))
}

/// Builds and starts the Discord bot gateway client.
async fn start_bot(deps: BotDeps) -> Result<(), Error> {
    let intents = GatewayIntents::GUILDS
        | GatewayIntents::GUILD_MESSAGES
        | GatewayIntents::DIRECT_MESSAGES
        | GatewayIntents::MESSAGE_CONTENT
        | GatewayIntents::GUILD_MEMBERS
        | GatewayIntents::GUILD_MESSAGE_REACTIONS
        | GatewayIntents::GUILD_MODERATION
        | GatewayIntents::GUILD_VOICE_STATES;

    let active_names: Vec<&str> = intents.iter_names().map(|(name, _flag)| name).collect();

    info!("Selected intents: {:?}", active_names);

    let mut cache_settings = serenity::cache::Settings::default();
    cache_settings.max_messages = 5;
    cache_settings.cache_users = true;
    cache_settings.cache_channels = true;
    cache_settings.time_to_live = Duration::from_mins(30);

    debug!(
        max_messages = cache_settings.max_messages,
        cache_users = cache_settings.cache_users,
        cache_channels = cache_settings.cache_channels,
        cache_guilds = cache_settings.cache_guilds,
        ttl = cache_settings.time_to_live.as_secs(),
        "Setting up cache",
    );

    let commands_to_register = build_commands();

    info!("Registered {} commands", commands_to_register.len());

    let guild_configs_for_setup = deps.guild_configs.clone();
    let bad_words_cache_for_setup = deps.bad_words_cache.clone();

    let framework = poise::Framework::builder()
        .options(poise::FrameworkOptions {
            prefix_options: poise::PrefixFrameworkOptions {
                prefix: Some("!".into()),
                edit_tracker: Some(Arc::new(poise::EditTracker::for_timespan(
                    Duration::from_hours(1),
                ))),
                ..Default::default()
            },
            commands: commands_to_register,
            on_error: |error| Box::pin(on_error(error)),
            event_handler: |ctx, event, framework, data| {
                Box::pin(events::dispatch::dispatch_events(
                    ctx, event, framework, data,
                ))
            },
            ..Default::default()
        })
        .setup(move |ctx, ready, _framework| {
            setup(SetupParams {
                google_cloud_api_key: deps.google_cloud_api_key,
                pool: deps.pool,
                redis_client: deps.redis_client.clone(),
                subscriber_client: deps.subscriber_client.clone(),
                guild_configs_cache: guild_configs_for_setup.clone(),
                bad_words_cache: bad_words_cache_for_setup.clone(),
                ctx,
                username_tx: deps.username_tx.clone(),
                username_rx: deps.username_rx,
                reqwest_client: deps.reqwest_client.clone(),
                music_state: deps.music_state,
                ready,
            })
        })
        .build();

    let mut client = serenity::Client::builder(deps.token, intents)
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

    Ok(())
}

/// Collects the application commands to register with the gateway.
fn build_commands() -> Vec<poise::Command<BotData, Error>> {
    vec![
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
        search::search(),
        economy::economy(),
        register(),
    ]
}

#[poise::command(prefix_command, owners_only, hide_in_help)]
async fn register(ctx: poise::Context<'_, BotData, Error>) -> Result<(), Error> {
    poise::builtins::register_application_commands_buttons(ctx).await?;
    Ok(())
}
