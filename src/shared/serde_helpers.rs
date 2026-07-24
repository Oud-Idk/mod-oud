use serde::{Deserialize, Deserializer};

pub mod string_i64 {
    use serde::{Deserialize, Deserializer, Serialize, Serializer};

    pub fn serialize<S>(val: &i64, s: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer
    {
        val.to_string().serialize(s)
    }

    pub fn deserialize<'de, D>(d: D) -> Result<i64, D::Error>
    where
        D: Deserializer<'de>
    {
        String::deserialize(d)?.parse().map_err(serde::de::Error::custom)
    }
}

pub mod opt_string_i64 {
    use serde::{Deserialize, Deserializer, Serialize, Serializer};

    pub fn serialize<S>(val: &Option<i64>, s: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer
    {
        val.map(|v| v.to_string()).serialize(s)
    }

    pub fn deserialize<'de, D>(d: D) -> Result<Option<i64>, D::Error>
    where
        D: Deserializer<'de>
    {
        Option::<String>::deserialize(d)?
            .map(|s| s.parse().map_err(serde::de::Error::custom))
            .transpose()
    }
}

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