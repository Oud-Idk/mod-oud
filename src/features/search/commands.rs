#![allow(missing_docs, clippy::unused_async)]

use crate::core::config::state::Context;
use crate::features::search::{
    giphy::commands::giphy,
    kitsu::commands::{anime, manga},
    klipy::commands::klipy,
    spotify::commands::spotify,
    urban::commands::urban,
    youtube::commands::youtube,
    genius::commands::genius,
    tmdb::commands::movie,
    rawg::commands::rawg,
    pokeapi::commands::pokemon,
    open_meteo::commands::weather,
};
use anyhow::Result;

#[poise::command(
    slash_command,
    subcommands(
        "anime", "manga", "urban", "giphy", "klipy", "youtube",
        "spotify", "genius", "movie", "rawg", "pokemon", "weather",
    )
)]
pub async fn search(_: Context<'_>) -> Result<()> {
    Ok(())
}
