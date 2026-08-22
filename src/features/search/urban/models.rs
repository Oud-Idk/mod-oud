use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UrbanResponse {
    pub list: Vec<UrbanDefinition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UrbanDefinition {
    pub defid: u64,
    pub word: String,
    pub author: String,
    pub permalink: String,
    pub definition: String,
    pub example: String,
    pub thumbs_up: u64,
    pub thumbs_down: u64,
    pub written_on: Option<String>,
}
