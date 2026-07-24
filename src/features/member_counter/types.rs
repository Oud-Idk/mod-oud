use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CounterType {
    TotalMembers,
    HumansOnly,
    BotsOnly,
    OnlineMembers,
    RoleCount,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CounterChannel {
    pub id: String,
    pub channel_id: String,
    pub counter_type: CounterType,
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role_id: Option<String>,
    pub name_template: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MemberCounterConfig {
    pub enabled: bool,
    #[serde(default = "default_interval")]
    pub update_interval_minutes: u32,
    #[serde(default)]
    pub counters: Vec<CounterChannel>,
}

fn default_interval() -> u32 { 15 }