use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TempVoiceHub {
    pub id: uuid::Uuid,
    pub name: String,
    pub category_id: i64,
    pub user_limit: Option<i32>,
    pub default_channel_name: String,
}