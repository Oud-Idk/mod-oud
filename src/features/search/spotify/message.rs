use crate::constants::BRAND_COLOR;
use crate::features::search::spotify::models::SpotifyTrack;
use serenity::all::{CreateEmbed, CreateEmbedFooter};

const SPOTIFY_ICON: &str = "https://open.spotifycdn.com/cdn/images/favicon32.8e66b099.png";

pub fn create_spotify_message(track: &SpotifyTrack) -> CreateEmbed {
    let mut embed = CreateEmbed::new()
        .color(BRAND_COLOR)
        .title(&track.name)
        .url(&track.external_urls.spotify)
        .field("🎤 Artist(s)", track.artists_str(), true)
        .field("💿 Album", &track.album.name, true)
        .field("⏱ Duration", track.duration_str(), true);

    if let Some(date) = &track.album.release_date {
        embed = embed.field("🗓️ Released", date, true);
    }

    embed = embed
        .field("🔥 Popularity", format!("{}/100", track.popularity), true)
        .field("\u{200B}", "\u{200B}", true) // Spacer for 3-column balance
        .footer(CreateEmbedFooter::new("Spotify").icon_url(SPOTIFY_ICON));

    if let Some(img_url) = track.get_best_image() {
        embed = embed.thumbnail(img_url);
    }

    embed
}
