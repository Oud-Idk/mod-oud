use serde::{Deserialize, Deserializer};

pub mod config;
pub mod message_logging;
pub mod welcome;
pub mod message_filter;
pub mod starboard;
pub mod leveling;

fn ok_or_none<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    let v = serde_json::Value::deserialize(deserializer)?;

    match T::deserialize(v) {
        Ok(val) => Ok(Some(val)),
        Err(_) => Ok(None),
    }
}