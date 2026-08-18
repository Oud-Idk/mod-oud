use serde::{Deserialize, Deserializer};

/// Serializes/deserializes an `i64` as a string (for JSONB compatibility with
/// 64-bit IDs that lose precision in JS numbers).
pub mod string_i64 {
    use serde::{Deserialize, Deserializer, Serialize, Serializer};

    /// Serializes an `i64` as a string.
    pub fn serialize<S>(val: &i64, s: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        val.to_string().serialize(s)
    }

    /// Parses a string back into an `i64`.
    pub fn deserialize<'de, D>(d: D) -> Result<i64, D::Error>
    where
        D: Deserializer<'de>,
    {
        String::deserialize(d)?
            .parse()
            .map_err(serde::de::Error::custom)
    }
}

/// Serializes/deserializes an `Option<i64>` as an optional string.
pub mod opt_string_i64 {
    use serde::{Deserialize, Deserializer, Serialize, Serializer};

    /// Serializes an `Option<i64>` as an optional string.
    pub fn serialize<S>(val: &Option<i64>, s: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        val.map(|v| v.to_string()).serialize(s)
    }

    /// Parses an optional string into an `Option<i64>`.
    pub fn deserialize<'de, D>(d: D) -> Result<Option<i64>, D::Error>
    where
        D: Deserializer<'de>,
    {
        Option::<String>::deserialize(d)?
            .map(|s| s.parse().map_err(serde::de::Error::custom))
            .transpose()
    }
}

/// Deserializes a value, mapping any failure to `None` instead of an error.
pub fn ok_or_none<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
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
