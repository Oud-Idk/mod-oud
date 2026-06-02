use crate::models::spam_tracker::SpamTracker;
use serenity::all::{ChannelId, MessageId};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::time::Instant;

pub struct TicketInfo {
    pub message_count: u32,
    pub last_activity: Instant,
    pub warned: bool,
    pub last_button_message_id: Option<MessageId>,
}

pub struct Data {
    pub db: sqlx::PgPool,
    pub spam_tracker: SpamTracker,
    pub active_tickets: Arc<Mutex<HashMap<ChannelId, TicketInfo>>>,
}

pub type Error = Box<dyn std::error::Error + Send + Sync>;
pub type Context<'a> = poise::Context<'a, Data, Error>;
