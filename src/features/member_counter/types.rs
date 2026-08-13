use serde::{Deserialize, Serialize};
use serde_with::{serde_as, NoneAsEmptyString, DisplayFromStr};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CounterType {
    TotalMembers,
    HumansOnly,
    BotsOnly,
    OnlineMembers,
    RoleCount,
}

#[serde_as]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CounterChannel {
    #[serde_as(as = "DisplayFromStr")]
    pub id: Uuid,
    #[serde_as(as = "NoneAsEmptyString")]
    #[serde(default)]
    pub channel_id: Option<u64>,
    pub counter_type: CounterType,
    #[serde_as(as = "NoneAsEmptyString")]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub role_id: Option<u64>,
    pub name_template: String,
}

#[serde_as]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MemberCounterConfig {
    pub enabled: bool,
    #[serde(default = "default_interval")]
    pub update_interval_minutes: u32,
    #[serde(default)]
    pub counters: Vec<CounterChannel>,
    #[serde(default)]
    #[serde_as(as = "Option<DisplayFromStr>")]
    pub category_id: Option<u64>,
}

const fn default_interval() -> u32 { 15 }