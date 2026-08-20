use chrono::NaiveTime;
use chrono_tz::Tz;
use serenity::model::id::ChannelId;
use sqlx::types::Json;

use crate::core::config::message_layout::MessageLayout;

#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type, Default)]
#[sqlx(type_name = "reminder_type", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ReminderType {
    #[default]
    Single,
    Recurring,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct ReminderRecord {
    pub id: i64,
    pub channel_id: i64,
    pub r_type: ReminderType,
    pub days_of_week: Option<Vec<i32>>,
    pub time_start: Option<NaiveTime>,
    pub time_end: Option<NaiveTime>,
    pub interval_seconds: Option<i32>,
    pub timezone: Option<String>,
    pub message: Json<MessageLayout>,
}

impl ReminderRecord {
    /// Helper to convert the database `channel_id` (i64) into Serenity's `ChannelId`.
    #[must_use]
    pub const fn serenity_channel_id(&self) -> ChannelId {
        ChannelId::new(self.channel_id.cast_unsigned())
    }

    /// Parses the optional timezone string into a strongly-typed `chrono_tz::Tz`.
    #[must_use]
    pub fn parsed_timezone(&self) -> Option<Tz> {
        self.timezone.as_deref().and_then(|tz| tz.parse().ok())
    }

    /// Converts database `days_of_week` (i32) into `Vec<u32>` for `RecurrenceRule`.
    #[must_use]
    pub fn parsed_days_of_week(&self) -> Vec<u32> {
        self.days_of_week
            .as_deref()
            .unwrap_or_default()
            .iter()
            .map(|&day| u32::try_from(day).unwrap_or(u32::MIN))
            .collect()
    }
}
