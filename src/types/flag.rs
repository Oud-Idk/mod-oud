use serde::{Deserialize, Serialize};
use std::fmt;

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