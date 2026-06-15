use crate::commands::{emergency, moderation, ticket};
use crate::core::web::start_web_server;
use crate::models::spam_tracker::SpamTracker;
use crate::types::types::{LogEvent, SearchUrlsResponse};
use commands::{messages, ping, warn};
use poise::serenity_prelude as serenity;
use prost::Message;
use serenity::gateway::ShardManager;
use serenity::prelude::GatewayIntents;
use std::env;
use std::sync::Arc;
use tokio::sync::broadcast;
use types::types::{Data, Error};

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

struct WebState {
    tx: broadcast::Sender<LogEvent>,
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

    // Initialize the database connection pool
    let pool = sqlx::PgPool::connect(&database_url).await?;
    let redis_client = redis::Client::open(redis_url)?;

    let (tx, _) = broadcast::channel::<LogEvent>(100);
    start_web_server(redis_client.clone(), tx).await?;

    let intents = GatewayIntents::GUILDS
        | GatewayIntents::GUILD_MESSAGES
        | GatewayIntents::DIRECT_MESSAGES
        | GatewayIntents::MESSAGE_CONTENT
        | GatewayIntents::GUILD_MEMBERS
        | GatewayIntents::GUILD_MESSAGE_REACTIONS;

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
                moderation::commands::purge(),
                moderation::commands::kick(),
                moderation::commands::ban(),
                moderation::commands::mute(),
                moderation::commands::unmute(),
                moderation::commands::softban(),
                moderation::commands::unban(),
                warn::warn(),
                warn::search_warning_by_id(),
                warn::warn_history(),
                warn::pardon_warning(),
                warn::unpardon_warning(),
                warn::delete_warning(),
                warn::search_warnings(),
                messages::deleted_history(),
                messages::edit_history(),
                messages::report_message(),
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

                jobs::temp_ban::start_temp_ban_worker(pool.clone(), ctx.http.clone());

                jobs::ticket_inactivity::start_ticket_inactivity_worker(
                    pool.clone(),
                    ctx.http.clone(),
                );

                jobs::dashboard_commands::start_dashboard_command_worker(
                    pool.clone(),
                    ctx.http.clone(),
                    redis_client.clone(),
                );

                let spam_tracker = SpamTracker::new(redis_client.clone());
                let redis_conn = redis_client.get_multiplexed_async_connection().await?;
                let client = match safe_browsing_api_key {
                    Some(k) => Some(SafeBrowsingClient::new(k)),
                    None => None,
                };

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

    Ok(())
}

#[poise::command(prefix_command, owners_only, hide_in_help)]
async fn register(ctx: poise::Context<'_, Data, Error>) -> Result<(), Error> {
    poise::builtins::register_application_commands_buttons(ctx).await?;
    Ok(())
}
