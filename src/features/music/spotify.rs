use crate::shared::spotify_auth::SpotifyAuthCache;
use serde::Deserialize;
use tracing::{debug, warn};

#[derive(Deserialize)]
struct PlaylistTracksResponse {
    items: Option<Vec<PlaylistItem>>,
    next: Option<String>,
}

#[derive(Deserialize)]
struct PlaylistItem {
    track: Option<SpotifyTrack>,
}

#[derive(Deserialize)]
struct SpotifyTrack {
    name: Option<String>,
    artists: Option<Vec<SpotifyArtist>>,
}

#[derive(Deserialize)]
struct SpotifyArtist {
    name: Option<String>,
}

/// Fetches ALL tracks from a Spotify Playlist by paginating 100 tracks at a time!
pub async fn resolve_spotify_playlist(
    client: &reqwest::Client,
    spotify_auth: &SpotifyAuthCache,
    url: &str,
) -> Option<Vec<String>> {
    if !url.contains("open.spotify.com/playlist/") && !url.contains("spotify:playlist:") {
        return None;
    }

    let playlist_id = url.split("/playlist/").nth(1)?.split('?').next()?;

    let Some(token) = spotify_auth.get_token(client).await else {
        warn!("Could not retrieve Spotify API token. Check SPOTIFY_CLIENT_ID / SECRET env vars.");
        return None;
    };

    let mut search_terms = Vec::new();
    let mut offset = 0;
    let limit = 100;

    debug!(playlist_id = %playlist_id, "Fetching Spotify playlist tracks via Web API");

    loop {
        let api_url = format!(
            "https://api.spotify.com/v1/playlists/{playlist_id}/tracks?limit={limit}&offset={offset}"
        );

        let res = match client.get(&api_url).bearer_auth(&token).send().await {
            Ok(r) => r,
            Err(e) => {
                warn!(error = %e, "Network error while fetching playlist tracks page");
                break;
            }
        };

        if !res.status().is_success() {
            warn!(status = %res.status(), "Spotify API returned error status for playlist tracks");
            break;
        }

        // Get raw text response first for easy debugging
        let body_text = match res.text().await {
            Ok(t) => t,
            Err(e) => {
                warn!(error = %e, "Failed to read response body text from Spotify");
                break;
            }
        };

        // Deserialize safely
        let data: PlaylistTracksResponse = match serde_json::from_str(&body_text) {
            Ok(d) => d,
            Err(e) => {
                warn!(error = %e, raw_body = %body_text, "Failed to deserialize Spotify playlist tracks JSON");
                break;
            }
        };

        let items = match data.items {
            Some(i) if !i.is_empty() => i,
            _ => break,
        };

        for item in &items {
            if let Some(track) = &item.track {
                // Check if track has a valid name
                if let Some(track_name) = &track.name {
                    if track_name.is_empty() {
                        continue;
                    }

                    // Safely extract artist name if present (or fallback to empty string)
                    let artist_name = track
                        .artists
                        .as_deref()
                        .unwrap_or(&[])
                        .first()
                        .and_then(|a| a.name.as_deref())
                        .unwrap_or("");

                    search_terms.push(
                        format!("ytsearch:{artist_name} {track_name}")
                            .trim()
                            .to_string(),
                    );
                }
            }
        }

        if data.next.is_none() {
            break;
        }

        offset += limit;
    }

    if search_terms.is_empty() {
        warn!(url = %url, "Failed to fetch tracks from Spotify API or playlist was empty");
        None
    } else {
        debug!(
            count = search_terms.len(),
            "Successfully fetched all playlist tracks"
        );
        Some(search_terms)
    }
}

#[derive(Deserialize)]
struct TrackResponse {
    name: Option<String>,
    artists: Option<Vec<SpotifyArtist>>,
}

/// Resolves a single Spotify track URL or URI into a `YouTube` search term via Spotify Web API.
pub async fn resolve_spotify_track(
    client: &reqwest::Client,
    spotify_auth: &SpotifyAuthCache,
    url: &str,
) -> Option<String> {
    if !url.contains("open.spotify.com/track/") && !url.contains("spotify:track:") {
        return None;
    }

    // Extract Track ID from either open.spotify.com/track/ID... or spotify:track:ID
    let track_id = if url.contains("spotify:track:") {
        url.split("spotify:track:").nth(1)?.split('?').next()?
    } else {
        url.split("/track/").nth(1)?.split('?').next()?
    };

    let Some(token) = spotify_auth.get_token(client).await else {
        warn!("Could not retrieve Spotify API token for track resolution.");
        return None;
    };

    let api_url = format!("https://api.spotify.com/v1/tracks/{track_id}");

    let res = client.get(&api_url).bearer_auth(&token).send().await.ok()?;

    if !res.status().is_success() {
        warn!(status = %res.status(), track_id = %track_id, "Spotify API returned error for track");
        return None;
    }

    let track: TrackResponse = res.json().await.ok()?;
    let track_name = track.name?;

    let artist_name = track
        .artists
        .as_deref()
        .unwrap_or(&[])
        .first()
        .and_then(|a| a.name.as_deref())
        .unwrap_or("");

    let search_term = format!("ytsearch:{artist_name} {track_name}")
        .trim()
        .to_string();

    debug!(url = %url, search_term = %search_term, "Resolved Spotify track via Web API");
    Some(search_term)
}
