use crate::commands::{emergency, leveling, moderation, ticket};
use crate::core::web::start_web_server;
use crate::models::spam_tracker::SpamTracker;
use commands::{messages, ping};
use poise::serenity_prelude as serenity;
use prost::Message;
use serenity::gateway::ShardManager;
use serenity::prelude::GatewayIntents;
use std::env;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::broadcast;
use types::{Data, Error, LogEvent, SearchUrlsResponse};

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

pub struct WebState {
    pub tx: broadcast::Sender<LogEvent>,
    pub pool: sqlx::PgPool,
    pub http: Arc<poise::serenity_prelude::Http>,
    pub redis_client: redis::Client,
}

pub struct SafeBrowsingClient {
    api_key: String,
    http_client: reqwest::Client,
}

impl SafeBrowsingClient {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            http_client: reqwest::Client::new(),
        }
    }

    /// Checks a batch of URLs and returns recognized threats
    pub async fn check_urls(&self, urls: &[&str]) -> Result<Vec<i32>, Error> {
        let endpoint = "https://safebrowsing.googleapis.com/v5/urls:search";
        let mut query_params = vec![("key".to_string(), self.api_key.clone())];
        for url in urls {
            query_params.push(("urls".to_string(), url.to_string()));
        }

        let response = self.http_client.get(endpoint).query(&query_params).send().await?;
        if !response.status().is_success() {
            return Err(format!("Safe Browsing API Error: {}", response.text().await?).into());
        }

        let bytes = response.bytes().await?;
        let search_response = SearchUrlsResponse::decode(bytes)?;

        let mut threat_types = Vec::new();
        for threat in search_response.threats {
            threat_types.extend(threat.threat_types);
        }

        Ok(threat_types)
    }
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
    let safe_browsing_api_key: Option<String> = env::var("SAFE_BROWSING_KEY").ok();

    let run_bot: bool = env::var("RUN_BOT")
        .unwrap_or_else(|_| "true".to_string())
        .parse()
        .unwrap_or(true);

    let run_web: bool = env::var("RUN_WEB")
        .unwrap_or_else(|_| "true".to_string())
        .parse()
        .unwrap_or(true);

    let pool = sqlx::PgPool::connect(&database_url).await?;

    println!("Checking database migrations...");
    sqlx::migrate!()
        .run(&pool)
        .await?;
    println!("Database migrations complete.");

    let pool = sqlx::PgPool::connect(&database_url).await?;
    let redis_client = redis::Client::open(redis_url)?;

    let http = Arc::new(serenity::Http::new(&token));

    if run_web {
        // Increased broadcast capacity to 1024 to prevent client lag during high traffic
        let (tx, _) = broadcast::channel::<LogEvent>(1024);
        start_web_server(
            pool.clone(),
            Arc::clone(&http),
            redis_client.clone(),
            tx,
        ).await?;
    }

    // 2. Conditionally start the Bot Gateway Client
    if run_bot {
        let intents = GatewayIntents::GUILDS
            | GatewayIntents::GUILD_MESSAGES
            | GatewayIntents::DIRECT_MESSAGES
            | GatewayIntents::MESSAGE_CONTENT
            | GatewayIntents::GUILD_MEMBERS
            | GatewayIntents::GUILD_MESSAGE_REACTIONS;

        let mut cache_settings = serenity::cache::Settings::default();
        cache_settings.max_messages = 5;
        cache_settings.cache_users = false;
        cache_settings.cache_channels = false;
        cache_settings.time_to_live = Duration::from_secs(60 * 30);

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
                ],
                on_error: |error| Box::pin(utils::error::on_error(error)),
                event_handler: |ctx, event, framework, data| {
                    Box::pin(events::events::event_handler(ctx, event, framework, data))
                },
                ..Default::default()
            })
            .setup(move |ctx, _ready, _framework| {
                Box::pin(async move {
                    println!("Logged in as {}", _ready.user.name);

                    // Workers now accept redis_client to execute Redis Distributed Locks (HA)
                    jobs::temp_ban::start_temp_ban_worker(
                        pool.clone(),
                        ctx.http.clone(),
                        redis_client.clone()
                    );

                    jobs::ticket_inactivity::start_ticket_inactivity_worker(
                        pool.clone(),
                        ctx.http.clone(),
                        redis_client.clone(),
                    );

                    let spam_tracker = SpamTracker::new(redis_client.clone());
                    let redis_conn = redis_client.get_multiplexed_async_connection().await?;
                    let client = safe_browsing_api_key.map(SafeBrowsingClient::new);

                    Ok(Data {
                        db: pool,
                        redis: redis_conn,
                        spam_tracker,
                        safe_browsing_client: client,
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

        println!("Starting Shard {} of {}...", shard_index + 1, total_shards);

        client.start_shard(shard_index, total_shards).await?;
    } else {
        println!("Bot Gateway client is disabled. Web server running exclusively.");
        tokio::signal::ctrl_c().await?;
    }

    Ok(())
}

#[poise::command(prefix_command, owners_only, hide_in_help)]
async fn register(ctx: poise::Context<'_, Data, Error>) -> Result<(), Error> {
    poise::builtins::register_application_commands_buttons(ctx).await?;
    Ok(())
}