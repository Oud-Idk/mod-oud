use std::collections::HashMap;
use commands::{config, messages, moderation, ping, warn};
use poise::serenity_prelude as serenity;
use serenity::gateway::ShardManager;
use serenity::prelude::GatewayIntents;
use std::env;
use std::sync::Arc;
use tokio::sync::Mutex;
use serenity::all::{ChannelId, MessageId};
use tokio::time::Instant;
use crate::commands::{emergency, ticket};
use crate::utils::spam_tracker::SpamTracker;

mod commands;
mod event_handlers;
mod utils;

pub struct TicketInfo {
    pub message_count: u32,
    pub last_activity: Instant,
    pub warned: bool,
    pub last_button_message_id: Option<MessageId>,
}

pub struct Data {
    pub db: sqlx::PgPool,
    pub spam_tracker: SpamTracker,
    pub active_tickets: Arc<Mutex<HashMap<ChannelId, TicketInfo>>>
}
pub type Error = Box<dyn std::error::Error + Send + Sync>;
pub type Context<'a> = poise::Context<'a, Data, Error>;

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
                Box::pin(utils::event_handler::event_handler(
                    ctx, event, framework, data,
                ))
            },
            ..Default::default()
        })
        .setup(|ctx, _ready, framework| {
            Box::pin(async move {
                println!("Logged in as {}", _ready.user.name);
                poise::builtins::register_globally(ctx, &framework.options().commands).await?;

                utils::worker::start_temp_ban_worker(pool.clone(), ctx.http.clone());

                Ok(Data {
                    db: pool,
                    spam_tracker: SpamTracker::new(),
                    active_tickets: Arc::new(Mutex::new(HashMap::new())),
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
