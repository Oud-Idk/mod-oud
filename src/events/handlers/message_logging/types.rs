use serde::{Deserialize, Serialize};

pub struct MessageDetails {
    pub(crate) msg_id: i64,
    pub(crate) author_id: i64,
    pub(crate) author_name: String,
    pub(crate) chan_id: i64,
    pub(crate) content: String,
    pub(crate) image_urls: Vec<String>,
}

pub struct EditDetails {
    pub(crate) msg_id: i64,
    pub(crate) chan_id: i64,
    pub(crate) author_id: i64,
    pub(crate) author_name: String,
    pub(crate) old_content: Option<String>,
    pub(crate) new_content: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct DistributedCachedMessage {
    pub author_id: i64,
    pub author_name: String,
    pub content: String,
    pub image_urls: Vec<String>,
}