use crate::{core::config::message_layout::MessageLayout, features::birthday::format};
use serde::{Deserialize, Serialize};
use serde_with::{DisplayFromStr, serde_as};
use serenity::all::UserId;

/// Information for a single member celebrating a birthday today
#[derive(Clone, Debug)]
pub struct BirthdayMember {
    pub user_id: UserId,
    pub display_name: String,
    pub birth_year: Option<i32>,
}

impl BirthdayMember {
    pub fn format_line(&self, current_year: i32) -> String {
        self.birth_year.map_or_else(
            || format!("• <@{}>", self.user_id),
            |y| {
                format!(
                    "• <@{}> ({} Birthday!)",
                    self.user_id,
                    format::format_ordinal(current_year - y)
                )
            },
        )
    }
}

#[derive(sqlx::FromRow)]
#[allow(clippy::struct_field_names)]
pub struct ExpiredRole {
    pub guild_id: i64,
    pub user_id: i64,
    pub role_id: i64,
}

fn default_timezone() -> String {
    "UTC".to_string()
}

// TODO fix Values
/// Config for the birthday announcements feature.
#[serde_as]
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BirthdayConfig {
    /// Whether birthday announcements are enabled.
    pub enabled: bool,
    /// Channel where announcements are posted.
    #[serde_as(as = "Option<DisplayFromStr>")]
    pub channel_id: Option<u64>,
    /// Hour of day (UTC) at which announcements are posted.
    pub announcement_hour: i16,
    /// IANA timezone used for "today" calculations.
    #[serde(default = "default_timezone")]
    pub timezone: String,
    /// Role granted to members on their birthday, if any.
    #[serde_as(as = "Option<DisplayFromStr>")]
    pub birthday_role_id: Option<u64>,
    /// Whether the birth year is required from members.
    pub require_year: bool,
    /// Announcement message template for celebrants.
    pub message: MessageLayout,
}

#[derive(sqlx::FromRow)]
pub struct UserBirthdayRecord {
    pub user_id: i64,
    pub birth_year: Option<i32>,
}

#[derive(sqlx::FromRow, Debug, Clone)]
pub struct FullUserBirthdayRecord {
    pub user_id: i64,
    pub birth_month: i16,
    pub birth_day: i16,
    pub birth_year: Option<i32>,
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
