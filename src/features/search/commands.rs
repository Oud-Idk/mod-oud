#![allow(missing_docs, clippy::unused_async)]

use crate::core::config::state::Context;
use crate::features::search::{
    genius::commands::genius,
    giphy::commands::giphy,
    kitsu::commands::{anime, manga},
    klipy::commands::klipy,
    open_meteo::commands::weather,
    pokeapi::commands::pokemon,
    rawg::commands::rawg,
    spotify::commands::spotify,
    tmdb::commands::movie,
    urban::commands::urban,
    wordnik::commands::wordnik,
    youtube::commands::youtube,
};
use anyhow::Result;

#[poise::command(
    slash_command,
    subcommands(
        "anime", "manga", "urban", "giphy", "klipy", "youtube", "spotify", "genius", "movie",
        "rawg", "pokemon", "weather", "wordnik"
    )
)]
pub async fn search(_: Context<'_>) -> Result<()> {
    Ok(())
}
