use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeocodingResponse {
    #[serde(default)]
    pub results: Vec<GeoLocation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeoLocation {
    pub id: u64,
    pub name: String,
    pub latitude: f64,
    pub longitude: f64,
    pub country: Option<String>,
    pub country_code: Option<String>,
    pub admin1: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeatherResponse {
    pub latitude: f64,
    pub longitude: f64,
    pub timezone: String,
    pub current: CurrentWeather,
    pub current_units: CurrentUnits,
    #[serde(default)]
    pub daily: DailyWeather,
    #[serde(default)]
    pub daily_units: DailyUnits,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurrentWeather {
    pub time: String,
    pub temperature_2m: f64,
    pub relative_humidity_2m: i32,
    pub apparent_temperature: f64,
    pub is_day: u8,
    pub precipitation: f64,
    pub weather_code: u8,
    pub wind_speed_10m: f64,
    #[serde(default)]
    pub wind_direction_10m: i32,
    #[serde(default)]
    pub wind_gusts_10m: f64,
    #[serde(default)]
    pub surface_pressure: f64,
    #[serde(default)]
    pub cloud_cover: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurrentUnits {
    pub temperature_2m: String,
    pub relative_humidity_2m: String,
    pub apparent_temperature: String,
    pub precipitation: String,
    pub wind_speed_10m: String,
    #[serde(default)]
    pub wind_direction_10m: String,
    #[serde(default)]
    pub wind_gusts_10m: String,
    #[serde(default)]
    pub surface_pressure: String,
    #[serde(default)]
    pub cloud_cover: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DailyWeather {
    pub time: Vec<String>,
    pub weather_code: Vec<u8>,
    pub temperature_2m_max: Vec<f64>,
    pub temperature_2m_min: Vec<f64>,
    pub sunrise: Vec<String>,
    pub sunset: Vec<String>,
    pub precipitation_probability_max: Vec<Option<i32>>,
    pub uv_index_max: Vec<Option<f64>>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DailyUnits {
    pub temperature_2m_max: String,
    pub temperature_2m_min: String,
}