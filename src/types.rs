use crate::models::spam_tracker::SpamTracker;
use prost::Message;
use serde::{Deserialize, Serialize};
use std::fmt;
pub struct Data {
    pub db: sqlx::PgPool,
    pub redis: redis::Client,
    pub spam_tracker: SpamTracker,
}

pub type Error = Box<dyn std::error::Error + Send + Sync>;
pub type Context<'a> = poise::Context<'a, Data, Error>;

#[derive(Clone, PartialEq, Message)]
pub struct Duration {
    #[prost(int64, tag = "1")]
    pub seconds: i64,
    #[prost(int32, tag = "2")]
    pub nanos: i32,
}

#[derive(Clone, PartialEq, Message)]
pub struct SearchUrlsResponse {
    #[prost(message, repeated, tag = "1")]
    pub threats: Vec<ThreatUrl>,
    #[prost(message, optional, tag = "2")]
    pub cache_duration: Option<Duration>,
}

#[derive(Clone, PartialEq, Message)]
pub struct ThreatUrl {
    #[prost(string, tag = "1")]
    pub url: String,
    // Google packs repeated enum fields into wire-level i32 sequences
    #[prost(int32, repeated, tag = "2")]
    pub threat_types: Vec<i32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ThreatType {
    Unspecified,
    Malware,
    SocialEngineering,
    UnwantedSoftware,
    PotentiallyHarmfulApplication,
    Unknown(i32),
}

impl From<i32> for ThreatType {
    fn from(val: i32) -> Self {
        match val {
            0 => ThreatType::Unspecified,
            1 => ThreatType::Malware,
            2 => ThreatType::SocialEngineering,
            3 => ThreatType::UnwantedSoftware,
            4 => ThreatType::PotentiallyHarmfulApplication,
            other => ThreatType::Unknown(other),
        }
    }
}

impl fmt::Display for ThreatType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let name = match self {
            ThreatType::Unspecified => "THREAT_TYPE_UNSPECIFIED",
            ThreatType::Malware => "MALWARE",
            ThreatType::SocialEngineering => "SOCIAL_ENGINEERING",
            ThreatType::UnwantedSoftware => "UNWANTED_SOFTWARE",
            ThreatType::PotentiallyHarmfulApplication => "POTENTIALLY_HARMFUL_APPLICATION",
            ThreatType::Unknown(val) => return write!(f, "UNKNOWN_THREAT_TYPE({val})"),
        };
        write!(f, "{name}")
    }
}

#[derive(
    Debug, Clone, Copy, PartialEq, Eq, sqlx::Type, poise::ChoiceParameter, Serialize, Deserialize,
)]
#[sqlx(type_name = "flag_severity", rename_all = "UPPERCASE")]
pub enum FlagSeverity {
    #[name = "Mild"]
    Mild,
    #[name = "Moderate"]
    Moderate,
    #[name = "Severe"]
    Severe,
}

impl FlagSeverity {
    /// Helper to map the rustrict analysis to our custom enum
    pub fn from_analysis(analysis: rustrict::Type) -> Option<Self> {
        if analysis.is(rustrict::Type::SEVERE) {
            Some(FlagSeverity::Severe)
        } else if analysis.is(rustrict::Type::MODERATE) {
            Some(FlagSeverity::Moderate)
        } else if analysis.is(rustrict::Type::MILD) {
            Some(FlagSeverity::Mild)
        } else {
            None
        }
    }

    /// Explicitly provide the string name
    pub fn name(&self) -> &'static str {
        match self {
            FlagSeverity::Mild => "Mild",
            FlagSeverity::Moderate => "Moderate",
            FlagSeverity::Severe => "Severe",
        }
    }
}

impl fmt::Display for FlagSeverity {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let label = match self {
            FlagSeverity::Mild => "MILD",
            FlagSeverity::Moderate => "MODERATE",
            FlagSeverity::Severe => "SEVERE",
        };
        write!(f, "{}", label)
    }
}

pub struct LogConfig {
    pub title: &'static str,
    pub color: u32,
    pub reason_label: &'static str,
    pub reason_value: String,
}
