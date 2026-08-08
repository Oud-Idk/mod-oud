use serde::{Deserialize, Serialize};
use serde_json::Value;
use serde_with::{DisplayFromStr, serde_as};
use serenity::all::UserId;

/// Information for a single member celebrating a birthday today
pub struct BirthdayMember {
    pub user_id: UserId,
    pub display_name: String,
    pub birth_year: Option<i16>,
}

#[derive(sqlx::FromRow)]
pub struct ExpiredRole {
    pub(crate) guild_id: i64,
    pub(crate) user_id: i64,
    pub(crate) role_id: i64,
}

fn default_timezone() -> String {
    "UTC".to_string()
}

#[serde_as]
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BirthdayConfig {
    pub enabled: bool,
    #[serde_as(as = "DisplayFromStr")]
    pub guild_id: u64,
    #[serde_as(as = "Option<DisplayFromStr>")]
    pub channel_id: Option<u64>,
    pub announcement_hour: i16,
    #[serde(default = "default_timezone")]
    pub timezone: String,
    #[serde_as(as = "Option<DisplayFromStr>")]
    pub birthday_role_id: Option<u64>,
    pub timezone_offset_hours: i16,
    pub require_year: bool,
    pub message_with_year: Value,
    pub message_without_year: Value,
}
#[derive(sqlx::FromRow)]
pub struct UserBirthdayRecord {
    pub user_id: i64,
    pub birth_year: Option<i16>,
}

#[derive(sqlx::FromRow, Debug, Clone)]
pub struct FullUserBirthdayRecord {
    pub user_id: i64,
    pub birth_month: i16,
    pub birth_day: i16,
    pub birth_year: Option<i16>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, poise::ChoiceParameter)]
pub enum Month {
    January = 1,
    February = 2,
    March = 3,
    April = 4,
    May = 5,
    June = 6,
    July = 7,
    August = 8,
    September = 9,
    October = 10,
    November = 11,
    December = 12,
}