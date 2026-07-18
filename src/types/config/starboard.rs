use crate::types::embed::DiscordEmbed;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use serde_with::{serde_as, DisplayFromStr};
use sqlx::postgres::types::PgInterval;
use sqlx::types::chrono::{DateTime, Utc};
use sqlx::types::Json;

#[serde_as] // Required to enable the serde_as processing
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Starboard {
    pub id: i64,

    #[serde_as(as = "DisplayFromStr")]
    pub guild_id: u64,

    #[serde_as(as = "DisplayFromStr")]
    pub starboard_channel_id: u64,

    pub emojis: Option<Vec<String>>,
    pub reaction_threshold: Option<i32>,

    #[serde(with = "option_pg_interval_serde")]
    pub min_message_age: Option<PgInterval>,
    #[serde(with = "option_pg_interval_serde")]
    pub max_message_age: Option<PgInterval>,

    pub prevent_self_star: Option<bool>,
    pub allow_bot_messages: Option<bool>,
    pub role_restriction_type: Option<RestrictionType>,

    #[serde_as(as = "Option<Vec<DisplayFromStr>>")]
    pub restricted_roles: Option<Vec<u64>>,

    pub channel_restriction_type: Option<RestrictionType>,

    #[serde_as(as = "Option<Vec<DisplayFromStr>>")]
    pub restricted_channels: Option<Vec<u64>>,

    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
    pub embed_template: Option<DiscordEmbed>,
    pub plaintext_template: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "VARCHAR", rename_all = "snake_case")]
pub enum RestrictionType {
    #[sqlx(rename = "none")]
    None,
    #[sqlx(rename = "all_except")]
    AllExcept,
    #[sqlx(rename = "only_these")]
    OnlyThese,
}

// Serialization helper module for Option<PgInterval>
mod option_pg_interval_serde {
    use super::*;

    // A helper struct matching PgInterval's internal structure that derives Serde traits.
    #[derive(Serialize, Deserialize)]
    struct PgIntervalDef {
        months: i32,
        days: i32,
        microseconds: i64,
    }

    pub fn serialize<S>(value: &Option<PgInterval>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match value {
            Some(interval) => {
                let def = PgIntervalDef {
                    months: interval.months,
                    days: interval.days,
                    microseconds: interval.microseconds,
                };
                serializer.serialize_some(&def)
            }
            None => serializer.serialize_none(),
        }
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<PgInterval>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let opt: Option<PgIntervalDef> = Option::deserialize(deserializer)?;
        Ok(opt.map(|def| PgInterval {
            months: def.months,
            days: def.days,
            microseconds: def.microseconds,
        }))
    }
}

#[derive(sqlx::FromRow)]
pub struct StarboardRow {
    pub id: i64,
    pub guild_id: i64,
    pub starboard_channel_id: i64,
    pub emojis: Option<Vec<String>>,
    pub reaction_threshold: Option<i32>,
    pub min_message_age: Option<PgInterval>,
    pub max_message_age: Option<PgInterval>,
    pub prevent_self_star: Option<bool>,
    pub allow_bot_messages: Option<bool>,
    pub keep_deleted_messages: Option<bool>,
    pub role_restriction_type: Option<RestrictionType>,
    pub restricted_roles: Option<Vec<i64>>,
    pub channel_restriction_type: Option<RestrictionType>,
    pub restricted_channels: Option<Vec<i64>>,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
    pub embed_template: Option<Json<DiscordEmbed>>,
    pub plaintext_template: Option<String>,
}

impl TryFrom<StarboardRow> for Starboard {
    type Error = std::num::ParseIntError;

    fn try_from(row: StarboardRow) -> Result<Self, Self::Error> {
        Ok(Self {
            id: row.id,
            guild_id: row.guild_id as u64,
            starboard_channel_id: row.starboard_channel_id as u64,
            emojis: row.emojis,
            reaction_threshold: row.reaction_threshold,
            min_message_age: row.min_message_age,
            max_message_age: row.max_message_age,
            prevent_self_star: row.prevent_self_star,
            allow_bot_messages: row.allow_bot_messages,
            role_restriction_type: row.role_restriction_type,
            restricted_roles: row.restricted_roles
                .map(|v| v.into_iter().map(|s| s as u64).collect()),
            channel_restriction_type: row.channel_restriction_type,
            restricted_channels: row.restricted_channels
                .map(|v| v.into_iter().map(|s| s as u64).collect()),
            created_at: row.created_at,
            updated_at: row.updated_at,
            embed_template: row.embed_template.map(|json| json.0),
            plaintext_template: row.plaintext_template,
        })
    }
}
