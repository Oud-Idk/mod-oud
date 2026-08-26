use crate::core::config::state::Context;
use crate::features::search::open_meteo;
use anyhow::Context as _;
use poise::CreateReply;

/// Unit system selectable on the `/weather` command.
#[derive(Debug, Clone, Copy, PartialEq, Eq, poise::ChoiceParameter)]
pub enum UnitSystem {
    #[name = "Metric (°C, km/h, mm)"]
    Metric,
    #[name = "Imperial (°F, mph, in)"]
    Imperial,
}

/// Check the current weather for any location in the world!
#[poise::command(slash_command)]
pub async fn weather(
    ctx: Context<'_>,
    #[description = "City or region name (e.g. Tokyo, London, Jakarta)"] query: String,
    #[description = "How many days of forecast to show (default: 3)"]
    #[min = 1]
    #[max = 7]
    days: Option<u8>,
    #[description = "Unit system for temperature, wind, and precipitation"] units: Option<
        UnitSystem,
    >,
) -> anyhow::Result<()> {
    ctx.defer().await?;

    let reqwest_client = ctx.data().core.reqwest_client.clone();
    let client = open_meteo::client::OpenMeteoClient::new(reqwest_client);

    let geo_response = client.search_location(&query).await?;
    let location = geo_response
        .results
        .first()
        .with_context(|| format!("No location found matching `{query}`."))?;

    let forecast_days = days.unwrap_or(3).clamp(1, 7);
    let imperial = units == Some(UnitSystem::Imperial);

    let weather_response = client
        .get_weather(
            location.latitude,
            location.longitude,
            forecast_days,
            imperial,
        )
        .await?;

    let embed = open_meteo::message::create_weather_message(location, &weather_response);
    let reply = CreateReply::default().embed(embed);

    ctx.send(reply).await?;

    Ok(())
}
