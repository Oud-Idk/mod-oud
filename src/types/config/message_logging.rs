use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct MessageLoggingConfig {
    pub enabled: Option<bool>,
    pub ignored_channels: Option<Vec<String>>,
    pub ignored_roles: Option<Vec<String>>,
    pub ignored_users: Option<Vec<String>>,
    pub events: Option<MessageEventsConfig>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct MessageEventsConfig {
    pub message_delete: Option<bool>,
    pub message_edit: Option<bool>,
}