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
    automod, birthday, custom_commands, economy, general, giveaways, invite_tracking, join_leave,
    leveling, media_only, member_counter, moderation, music, raid_detection, reporting, search,
    social_notifications, temp_voice, tickets, warning,
};
use mod_oud::shared::logger;
use mod_oud::shared::spotify_auth::SpotifyAuthCache;
use mod_oud::shared::task;
use mod_oud::shared::username_cache::UserUpdate;
use mod_oud::web::server::{WebServerDeps, start_web_server};
use poise::serenity_prelude as serenity;
use serenity::gateway::ShardManager;
use serenity::prelude::GatewayIntents;
use songbird::SerenityInit;
use sqlx::ConnectOptions;
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use std::env;
use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{broadcast, mpsc};
use tokio::task::JoinHandle;
use tracing::log::LevelFilter;
use tracing::{Instrument, debug, error, info, info_span, warn};

fn main() -> Result<(), Error> {
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .thread_stack_size(4 * 1024 * 1024)
        .build()?;

    // Before `load_env`, so a local `.env` reaches both.
    let filter = logger::init();
    install_crypto_provider();
    let env_config = load_env();

    // The root span is the only way to tell which shard a line came from.
    let process = info_span!(
        "process",
        shard_id = env_config.shard_index,
        shard_count = env_config.total_shards,
        log_filter = %filter,
    );
    // `main` is the boundary for everything below it, so its error is logged here. Without this
    // the only record is the bare `Error:` that `Termination` prints on the way out.
    runtime
        .block_on(async_main(env_config).instrument(process))
        .inspect_err(|e| {
            error!(
                error = ?e,
                error_chain = %format!("{e:#}"),
                "process exited with an error"
            );
        })
}

async fn async_main(env_config: EnvConfig) -> Result<(), Error> {
    let pool = connect_database(&env_config.database_url, env_config.run_migrations).await?;
    let (redis_client, subscriber_client) = connect_redis(&env_config.redis_url).await?;

    // This one client backs all 13 search providers. Without a timeout a hung upstream holds
    // the task until Discord's interaction deadline, and nothing is logged because no error is
    // ever returned.
    let reqwest_client = reqwest::Client::builder()
        .user_agent("Mod Oud/0.1.0")
        .timeout(std::time::Duration::from_secs(10))
        .connect_timeout(std::time::Duration::from_secs(5))
        .build()?;

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
        let (shard_manager, mut gateway) = start_bot(BotDeps {
            token: env_config.token,
            google_cloud_api_key: env_config.google_cloud_api_key,
            shard_index: env_config.shard_index,
            total_shards: env_config.total_shards,
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

        // Without this a deploy kills the process mid-connection and the log ends mid-sentence,
        // so a restart is indistinguishable from a crash.
        tokio::select! {
            result = &mut gateway => {
                match result {
                    Ok(Ok(())) => {}
                    Ok(Err(e)) => error!(error = ?e, "gateway stopped on its own"),
                    Err(e) => error!(error = ?e, "gateway task ended abnormally"),
                }
            }
            signal = shutdown_signal() => {
                info!(signal, "shutdown signal received");
            }
        }

        info!("Draining");
        shard_manager.shutdown_all().await;
        // Bounded, so a shard that will not close cannot hang the deploy.
        if tokio::time::timeout(DRAIN_TIMEOUT, &mut gateway)
            .await
            .is_err()
        {
            warn!("drain timed out, exiting with the gateway still connected");
        }
    } else {
        warn!(
            "bot gateway client is disabled, web server running exclusively; ignore this warning if intentional"
        );
        let signal = shutdown_signal().await;
        info!(signal, "shutdown signal received");
    }

    info!("Stopped");

    Ok(())
}

/// How long the drain waits for the gateway to finish before the process exits anyway.
const DRAIN_TIMEOUT: Duration = Duration::from_secs(10);

/// Resolves on the first SIGTERM or SIGINT, naming which one arrived.
async fn shutdown_signal() -> &'static str {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{SignalKind, signal};

        if let Ok(mut terminate) = signal(SignalKind::terminate()) {
            return tokio::select! {
                _ = terminate.recv() => "SIGTERM",
                _ = tokio::signal::ctrl_c() => "SIGINT",
            };
        }
    }

    let _ = tokio::signal::ctrl_c().await;
    "SIGINT"
}

/// Environment variables parsed at startup.
struct EnvConfig {
    token: String,
    database_url: String,
    redis_url: String,
    google_cloud_api_key: String,
    shard_index: u32,
    total_shards: u32,
    run_bot: bool,
    run_web: bool,
    run_migrations: bool,
}

/// Dependencies required to start the Discord bot gateway client.
struct BotDeps {
    token: String,
    google_cloud_api_key: String,
    shard_index: u32,
    total_shards: u32,
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

/// Installs the rustls crypto provider before any TLS client is built.
///
/// Fails only when a provider is already installed, which is a no-op in practice.
fn install_crypto_provider() {
    if let Err(e) = rustls::crypto::ring::default_provider().install_default() {
        debug!(error = ?e, "rustls provider was already installed; reusing it");
    }
}

/// Reads all environment configuration into an [`EnvConfig`].
fn load_env() -> EnvConfig {
    let token = env::var("DISCORD_TOKEN")
        .expect("Expected a token in the environment table, `DISCORD_TOKEN`");

    let database_url = env::var("DATABASE_URL")
        .expect("Expected a database URL in the environment table, `DATABASE_URL`");

    let redis_url =
        env::var("REDIS_URL").expect("Expected a Redis URL in the environment table, `REDIS_URL`");

    let google_cloud_api_key = env::var("GOOGLE_CLOUD_API_KEY")
        .expect("Expected a Google Cloud API key in the environment table, `GOOGLE_CLOUD_API_KEY`");

    // Read here rather than per consumer, so the root span can name the shard.
    let shard_index: u32 = env::var("SHARD_INDEX")
        .unwrap_or_else(|_| "0".to_string())
        .parse()
        .expect("SHARD_INDEX must be a valid u32");

    let total_shards: u32 = env::var("TOTAL_SHARDS")
        .unwrap_or_else(|_| "1".to_string())
        .parse()
        .expect("TOTAL_SHARDS must be a valid u32");

    let run_bot: bool = env::var("RUN_BOT")
        .unwrap_or_else(|_| "true".to_string())
        .parse()
        .unwrap_or(true);

    if run_bot {
        debug!("discord bot enabled by RUN_BOT");
    } else {
        debug!("discord bot disabled by RUN_BOT");
    }

    let run_web: bool = env::var("RUN_WEB")
        .unwrap_or_else(|_| "true".to_string())
        .parse()
        .unwrap_or(true);

    if run_web {
        debug!("REST API enabled by RUN_WEB");
    } else {
        debug!("REST API disabled by RUN_WEB");
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
        shard_index,
        total_shards,
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
        pool_size = pool.size(),
        pool_idle = pool.num_idle(),
        "database pool connected"
    );

    if run_migrations {
        sqlx::migrate!().run(&pool).await?;
        info!("Migrations applied");
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
        user = redis_client
            .client_config()
            .username
            .as_deref()
            .unwrap_or("default"),
        "connected to redis"
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
        user = subscriber_client
            .client_config()
            .username
            .as_deref()
            .unwrap_or("default"),
        "connected to redis with subscriber"
    );

    Ok((redis_client, subscriber_client))
}

/// Builds and starts the Discord bot gateway client.
///
/// Returns the shard manager, which is what a graceful shutdown goes through, and a handle to the
/// gateway task. The handle is needed because `start_shard` does not return until every shard has
/// shut down.
async fn start_bot(
    deps: BotDeps,
) -> Result<(Arc<ShardManager>, JoinHandle<Result<(), Error>>), Error> {
    let intents = GatewayIntents::GUILDS
        | GatewayIntents::GUILD_MESSAGES
        | GatewayIntents::DIRECT_MESSAGES
        | GatewayIntents::MESSAGE_CONTENT
        | GatewayIntents::GUILD_MEMBERS
        | GatewayIntents::GUILD_MESSAGE_REACTIONS
        | GatewayIntents::GUILD_MODERATION
        | GatewayIntents::GUILD_VOICE_STATES;

    let active_names: Vec<&str> = intents.iter_names().map(|(name, _flag)| name).collect();

    info!(
        shard = deps.shard_index + 1,
        shard_count = deps.total_shards,
        intents = ?active_names,
        "shard selected intents"
    );

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
        "cache settings applied",
    );

    let commands_to_register = build_commands();

    info!(
        commands = commands_to_register.len(),
        "registered application commands"
    );

    let framework = poise::Framework::builder()
        .options(poise::FrameworkOptions {
            prefix_options: poise::PrefixFrameworkOptions {
                prefix: None,
                dynamic_prefix: Some(dynamic_prefix),
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
                shard_index: deps.shard_index,
                total_shards: deps.total_shards,
                pool: deps.pool,
                redis_client: deps.redis_client.clone(),
                subscriber_client: deps.subscriber_client.clone(),
                guild_configs_cache: deps.guild_configs.clone(),
                bad_words_cache: deps.bad_words_cache.clone(),
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

    // `start_shard` blocks for the life of the gateway, so it runs as a task the caller selects
    // on. A drain reaches the shards through `ShardManager`, which is why it is returned.
    let shard_manager = Arc::clone(&client.shard_manager);
    let gateway = task::spawn("gateway", async move {
        client
            .start_shard(deps.shard_index, deps.total_shards)
            .await
            .map_err(Error::from)
    });

    Ok((shard_manager, gateway))
}

/// Resolves the per-guild command prefix for poise prefix commands.
///
/// Falls back to `!` when the guild has no custom prefix or settings fail to
/// load, so prefix commands keep working even on cache/DB errors.
fn dynamic_prefix(
    ctx: poise::PartialContext<'_, BotData, Error>,
) -> poise::BoxFuture<'_, Result<Option<String>, Error>> {
    Box::pin(async move {
        let Some(guild_id) = ctx.guild_id else {
            return Ok(Some("!".to_string()));
        };
        let data = ctx.data;
        match config::settings::get_settings(
            &data.core.db,
            &data.core.redis,
            &data.core.guild_configs_cache,
            guild_id,
        )
        .await
        {
            Ok(settings) => Ok(Some(
                mod_oud::features::custom_commands::resolve_prefix(&settings).to_string(),
            )),
            Err(e) => {
                warn!(
                    error = ?e,
                    %guild_id,
                    fallback = "!",
                    "command prefix resolution failed"
                );
                Ok(Some("!".to_string()))
            }
        }
    })
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
        custom_commands::prefix(),
        raid_detection::raid(),
        birthday::birthday(),
        automod::honeypot(),
        temp_voice::voice(),
        member_counter::counters(),
        media_only::media_only(),
        music::music(),
        search::search(),
        economy::economy(),
        join_leave::test_member_message(),
        giveaways::giveaway(),
        social_notifications::subscribe(),
        register(),
    ]
}

#[poise::command(prefix_command, owners_only, hide_in_help)]
async fn register(ctx: poise::Context<'_, BotData, Error>) -> Result<(), Error> {
    poise::builtins::register_application_commands_buttons(ctx).await?;
    Ok(())
}
