use crate::core::config::message_layout::MessageLayout;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_with::{DisplayFromStr, serde_as};
use sqlx::types::Json;

#[serde_as]
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Giveaway {
    pub id: i64,
    #[serde_as(as = "DisplayFromStr")]
    pub guild_id: i64,
    #[serde_as(as = "DisplayFromStr")]
    pub host_id: i64,
    #[serde_as(as = "Option<DisplayFromStr>")]
    pub channel_id: Option<i64>,
    #[serde_as(as = "Option<DisplayFromStr>")]
    pub message_id: Option<i64>,

    pub prize: String,
    pub winner_count: i32,
    pub end_time: DateTime<Utc>,
    pub is_finished: bool,
    pub message: Json<MessageLayout>,
}
