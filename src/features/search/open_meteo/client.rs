use crate::features::search::open_meteo::models::{GeocodingResponse, WeatherResponse};

#[derive(Clone)]
pub struct OpenMeteoClient {
    http: reqwest::Client,
    geo_url: &'static str,
    weather_url: &'static str,
}

impl OpenMeteoClient {
    /// Wrap around your bot's shared reqwest client
    pub const fn new(http: reqwest::Client) -> Self {
        Self {
            http,
            geo_url: "https://geocoding-api.open-meteo.com/v1/search",
            weather_url: "https://api.open-meteo.com/v1/forecast",
        }
    }

    /// Geocode city name to get coordinates
    pub async fn search_location(&self, query: &str) -> Result<GeocodingResponse, reqwest::Error> {
        let response = self
            .http
            .get(self.geo_url)
            .query(&[
                ("name", query),
                ("count", "1"),
                ("language", "en"),
                ("format", "json"),
            ])
            .send()
            .await?
            .error_for_status()?
            .json::<GeocodingResponse>()
            .await?;

        Ok(response)
    }

    /// Fetch current weather plus a daily forecast by coordinates
    pub async fn get_weather(
        &self,
        lat: f64,
        lon: f64,
        forecast_days: u8,
        imperial: bool,
    ) -> Result<WeatherResponse, reqwest::Error> {
        let lat_str = lat.to_string();
        let lon_str = lon.to_string();
        let days_str = forecast_days.to_string();

        let response = self
            .http
            .get(self.weather_url)
            .query(&[
                ("latitude", lat_str.as_str()),
                ("longitude", lon_str.as_str()),
                (
                    "current",
                    "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure,cloud_cover",
                ),
                (
                    "daily",
                    "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,uv_index_max",
                ),
                ("forecast_days", days_str.as_str()),
                ("wind_speed_unit", if imperial { "mph" } else { "kmh" }),
                ("temperature_unit", if imperial { "fahrenheit" } else { "celsius" }),
                ("precipitation_unit", if imperial { "inch" } else { "mm" }),
                ("timezone", "auto"),
            ])
            .send()
            .await?
            .error_for_status()?
            .json::<WeatherResponse>()
            .await?;

        Ok(response)
    }
}
