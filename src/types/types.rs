use crate::models::spam_tracker::SpamTracker;
use prost::Message;

pub type Error = Box<dyn std::error::Error + Send + Sync>;
pub type Context<'a> = poise::Context<'a, Data, Error>;

pub struct Data {
    pub db: sqlx::PgPool,
    pub redis: redis::aio::MultiplexedConnection,
    pub spam_tracker: SpamTracker,
}

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

pub struct LogConfig {
    pub title: &'static str,
    pub color: u32,
    pub reason_label: &'static str,
    pub reason_value: String,
}
