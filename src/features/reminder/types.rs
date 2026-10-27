use chrono::NaiveTime;
use chrono_tz::Tz;
use serenity::model::id::ChannelId;
use sqlx::types::Json;
use std::num::NonZeroU64;

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
    /// Converts the database `channel_id` (i64) into Serenity's `ChannelId`.
    ///
    /// Returns `None` when the stored ID cannot be a Discord channel. `ChannelId::new` panics on
    /// zero, and `cast_unsigned` would turn a negative id into a huge one, so the sign is checked
    /// rather than cast away.
    #[must_use]
    pub fn serenity_channel_id(&self) -> Option<ChannelId> {
        let id = u64::try_from(self.channel_id).ok()?;
        match NonZeroU64::new(id) {
            Some(id) => Some(ChannelId::new(id.get())),
            None => None,
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    fn record_with_channel(channel_id: i64) -> ReminderRecord {
        ReminderRecord {
            id: 1,
            channel_id,
            r_type: ReminderType::Single,
            days_of_week: None,
            time_start: None,
            time_end: None,
            interval_seconds: None,
            timezone: None,
            message: Json(MessageLayout::default()),
        }
    }

    #[test]
    fn zero_channel_id_is_rejected_instead_of_panicking() {
        // `ChannelId::new(0)` panics; an unvalidated row used to take the worker down with it.
        assert_eq!(record_with_channel(0).serenity_channel_id(), None);
    }

    #[test]
    fn negative_channel_id_is_rejected() {
        assert_eq!(record_with_channel(-1).serenity_channel_id(), None);
    }

    #[test]
    fn valid_channel_id_is_converted() {
        let channel_id = record_with_channel(42).serenity_channel_id();
        assert_eq!(channel_id.map(|id| id.get()), Some(42));
    }
}
