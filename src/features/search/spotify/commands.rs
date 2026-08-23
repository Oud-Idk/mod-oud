use crate::core::config::state::Context;
use crate::features::search::spotify;
use anyhow::{Context as _, Result};
use poise::CreateReply;
use serenity::all::{ButtonStyle, CreateActionRow, CreateButton};

use crate::features::search::choose_or_first;

/// Searches for tracks on Spotify.
#[poise::command(slash_command)]
pub async fn spotify(
    ctx: Context<'_>,
    #[description = "Song or artist name"] query: String,
    #[description = "Pick a random track from search results"] random: Option<bool>,
) -> Result<()> {
    ctx.defer().await?;

    let reqwest_client = &ctx.data().core.reqwest_client;
    let auth_cache = &ctx.data().core.spotify_auth;

    let client = spotify::client::SpotifyClient::new(reqwest_client, auth_cache);

    let is_random = random.unwrap_or(false);
    let limit = if is_random { 25 } else { 1 };

    let response = client.search_track(&query, limit).await?;

    let tracks = response.tracks.map(|t| t.items).unwrap_or_default();

    let chosen_track =
        choose_or_first(tracks, is_random);

    let track =
        chosen_track.with_context(|| format!("No Spotify tracks found for '{query}'"))?;

    let embed = spotify::message::create_spotify_message(&track);
    let play_button = CreateButton::new(format!("search_spotify_play:{}", track.id))
        .label("▶️ Add to VC Queue")
        .style(ButtonStyle::Success);
    let components = vec![CreateActionRow::Buttons(vec![play_button])];
    let reply = CreateReply::default().embed(embed).components(components);

    ctx.send(reply).await?;

    Ok(())
}
