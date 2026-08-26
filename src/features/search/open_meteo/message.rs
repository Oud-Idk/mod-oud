use std::fmt::Write as _;

use chrono::NaiveDate;
use serenity::all::{CreateEmbed, CreateEmbedFooter};

use crate::constants::BRAND_COLOR;
use crate::features::search::open_meteo::models::{
    CurrentUnits, CurrentWeather, GeoLocation, WeatherResponse,
};

pub fn create_weather_message(location: &GeoLocation, weather: &WeatherResponse) -> CreateEmbed {
    let current = &weather.current;

    let is_day = current.is_day == 1;
    let (description, icon) = interpret_weather_code(current.weather_code, is_day);

    let flag = location
        .country_code
        .as_deref()
        .map(country_code_to_flag)
        .unwrap_or_default();

    let forecast_days = weather.daily.time.len().min(7);

    let mut embed = CreateEmbed::new()
        .color(BRAND_COLOR)
        .title(format!("{flag} Weather for {}", location_title(location)))
        .description(format!(
            "{icon} **{description}** • Updated {}",
            iso_time_part(&current.time)
        ))
        .footer(CreateEmbedFooter::new(format!(
            "Coordinates: {:.2}, {:.2} • Timezone: {} • Data: Open-Meteo",
            weather.latitude, weather.longitude, weather.timezone
        )));

    for (name, value) in current_condition_fields(weather) {
        embed = embed.field(name, value, true);
    }

    embed.field(
        format!("📅 {forecast_days}-Day Forecast"),
        forecast_section(weather),
        false,
    )
}

/// Inline field rows 1-3: temperature, wind, and atmosphere conditions.
fn current_condition_fields(weather: &WeatherResponse) -> Vec<(&'static str, String)> {
    let current = &weather.current;
    let units = &weather.current_units;

    let uv_value = weather
        .daily
        .uv_index_max
        .first()
        .copied()
        .flatten()
        .map_or_else(
            || "N/A".to_string(),
            |uv| format!("{uv:.1} ({})", uv_severity(uv)),
        );

    vec![
        (
            "🌡️ Temperature",
            format!("{:.1}{}", current.temperature_2m, units.temperature_2m),
        ),
        (
            "🤔 Feels Like",
            format!(
                "{:.1}{}",
                current.apparent_temperature, units.apparent_temperature
            ),
        ),
        (
            "💧 Humidity",
            format!(
                "{}{}",
                current.relative_humidity_2m, units.relative_humidity_2m
            ),
        ),
        ("💨 Wind", wind_field(current, units)),
        (
            "🌬️ Gusts",
            format!("{:.1} {}", current.wind_gusts_10m, units.wind_gusts_10m),
        ),
        (
            "🌧️ Precipitation",
            format!("{:.2} {}", current.precipitation, units.precipitation),
        ),
        (
            "🔽 Pressure",
            format!("{:.1}{}", current.surface_pressure, units.surface_pressure),
        ),
        (
            "☁️ Cloud Cover",
            format!("{}{}", current.cloud_cover, units.cloud_cover),
        ),
        ("☀️ UV Index", uv_value),
    ]
}

fn wind_field(current: &CurrentWeather, units: &CurrentUnits) -> String {
    format!(
        "{:.1} {} {}",
        current.wind_speed_10m,
        units.wind_speed_10m,
        wind_direction_to_compass(current.wind_direction_10m)
    )
}

/// Location display: "Jakarta, Jakarta (Indonesia)" or "Paris (France)"
fn location_title(location: &GeoLocation) -> String {
    let mut title = location.name.clone();
    if let Some(admin) = &location.admin1
        && admin != &location.name
    {
        let _ = write!(title, ", {admin}");
    }
    if let Some(country) = &location.country {
        let _ = write!(title, " ({country})");
    }
    title
}

/// Compact one-line-per-day outlook, e.g. "**Today:** ⛅ 32°/24° · 🌧️ 60%"
fn forecast_section(weather: &WeatherResponse) -> String {
    let daily = &weather.daily;
    let temp_unit = &weather.daily_units.temperature_2m_max;

    let mut out = String::new();
    for i in 0..daily.time.len().min(7) {
        let day_label = if i == 0 {
            String::from("Today")
        } else {
            NaiveDate::parse_from_str(&daily.time[i], "%Y-%m-%d").map_or_else(
                |_| daily.time[i].clone(),
                |date| date.format("%a %d %b").to_string(),
            )
        };
        let (_, icon) = interpret_weather_code(daily.weather_code[i], true);
        let precip_chance = daily.precipitation_probability_max[i].unwrap_or(0);

        let _ = writeln!(
            out,
            "**{day_label}:** {icon} {:.0}/{:.0}{temp_unit} · 🌧️ {precip_chance}%",
            daily.temperature_2m_max[i], daily.temperature_2m_min[i],
        );
    }

    out.trim_end().to_string()
}

/// "2026-08-22T05:45" -> "05:45"
fn iso_time_part(value: &str) -> &str {
    value.split('T').nth(1).unwrap_or(value)
}

/// Converts wind bearing in degrees to a 16-point compass label
fn wind_direction_to_compass(degrees: i32) -> &'static str {
    const DIRECTIONS: [&str; 16] = [
        "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW",
        "NW", "NNW",
    ];
    let sector = degrees.rem_euclid(360).div_euclid(23);
    let index = usize::try_from(sector).map_or(0, |s| s % DIRECTIONS.len());
    DIRECTIONS[index]
}

/// WHO UV Index severity band
fn uv_severity(uv: f64) -> &'static str {
    match uv {
        x if x < 3.0 => "Low",
        x if x < 6.0 => "Moderate",
        x if x < 8.0 => "High",
        x if x < 11.0 => "Very High",
        _ => "Extreme",
    }
}

/// Converts WMO Weather Code to human-readable text and emoji
const fn interpret_weather_code(code: u8, is_day: bool) -> (&'static str, &'static str) {
    match code {
        0 => {
            if is_day {
                ("Clear sky", "☀️")
            } else {
                ("Clear sky", "🌙")
            }
        }
        1 => ("Mainly clear", "🌤️"),
        2 => ("Partly cloudy", "⛅"),
        3 => ("Overcast", "☁️"),
        45 | 48 => ("Foggy", "🌫️"),
        51 | 53 | 55 => ("Drizzle", "🌦️"),
        56 | 57 => ("Freezing Drizzle", "🌧️"),
        61 | 63 => ("Rain", "🌧️"),
        65 => ("Heavy Rain", "🌧️🌧️"),
        66 | 67 => ("Freezing Rain", "🌨️"),
        71 | 73 | 75 => ("Snow fall", "🌨️"),
        77 => ("Snow grains", "❄️"),
        80..=82 => ("Rain showers", "🌦️"),
        85 | 86 => ("Snow showers", "🌨️"),
        95 => ("Thunderstorm", "⛈️"),
        96 | 99 => ("Thunderstorm with hail", "⛈️❄️"),
        _ => ("Unknown", "🌡️"),
    }
}

/// Helper to turn "US" -> 🇺🇸, "ID" -> 🇮🇩
fn country_code_to_flag(code: &str) -> String {
    code.to_uppercase()
        .chars()
        .filter_map(|c| {
            if c.is_ascii_alphabetic() {
                char::from_u32(0x1F1E6 + (c as u32 - 'A' as u32))
            } else {
                None
            }
        })
        .collect()
}
