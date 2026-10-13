use crate::features::music::spotify::{resolve_spotify_playlist, resolve_spotify_track};
use crate::features::music::youtube::{resolve_youtube_playlist, resolve_youtube_video};
use crate::shared::spotify_auth::SpotifyAuthCache;
use tracing::debug;

/// Resolves single queries (Spotify URLs, `YouTube` video URLs, or plain text searches).
pub(super) async fn build_query_url(
    client: &reqwest::Client,
    spotify_auth: &SpotifyAuthCache,
    query: &str,
    youtube_api_key: &str,
) -> String {
    // Try resolving Spotify track into ytsearch string
    if let Some(spotify_query) = resolve_spotify_track(client, spotify_auth, query).await {
        return spotify_query;
    }

    // Try resolving YouTube video/shorts/youtu.be link into a clean watch URL
    if let Some(youtube_query) = resolve_youtube_video(client, query, youtube_api_key).await {
        return youtube_query;
    }

    if query.starts_with("http://") || query.starts_with("https://") {
        debug!(query = %query, "query detected as direct URL");
        query.to_string()
    } else {
        let search_query = format!("ytsearch:{query}");
        debug!(query = %query, search_query = %search_query, "constructed ytsearch query");
        search_query
    }
}

/// Helper method to try resolving either Spotify or `YouTube` playlists into track search terms/URLs.
pub(super) async fn resolve_any_playlist(
    client: &reqwest::Client,
    spotify_auth: &SpotifyAuthCache,
    query: &str,
    youtube_api_key: &str,
) -> Option<Vec<String>> {
    if let Some(spotify_tracks) = resolve_spotify_playlist(client, spotify_auth, query).await {
        return Some(spotify_tracks);
    }

    if let Some(youtube_tracks) = resolve_youtube_playlist(client, query, youtube_api_key).await {
        return Some(youtube_tracks);
    }

    None
}
