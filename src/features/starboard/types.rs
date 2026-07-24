use crate::shared::embed::DiscordEmbed;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_with::serde_as;
use sqlx::postgres::types::PgInterval;
use sqlx::types::Json;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum StarboardOp {
    Add,
    Remove,
}


#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "RESTRICTION_TYPE", rename_all = "SCREAMING_SNAKE_CASE")]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RestrictionType {
    None,
    AllExcept,
    OnlyThese,
}

pub struct SimpleStarboard {
    pub keep_deleted_messages: Option<bool>,
    pub starboard_message_id: Option<i64>,
    pub starboard_channel_id: i64,
}

#[serde_as]
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Starboard {
    pub id: i64,
    pub guild_id: i64,
    pub starboard_channel_id: i64,
    pub emojis: Option<Vec<String>>,
    pub reaction_threshold: Option<i32>,
    #[serde(with = "option_pg_interval_serde")]
    pub min_message_age: Option<PgInterval>,
    #[serde(with = "option_pg_interval_serde")]
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

mod option_pg_interval_serde {
    use serde::{Deserialize, Deserializer, Serialize, Serializer};
    use sqlx::postgres::types::PgInterval;

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