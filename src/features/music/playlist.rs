use serde::Deserialize;
use tracing::{debug, error, warn};

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
}

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

/// Fetches a temporary access token using Spotify Client Credentials
async fn get_spotify_api_token(client: &reqwest::Client) -> Option<String> {
    let client_id = std::env::var("SPOTIFY_CLIENT_ID").ok()?;
    let client_secret = std::env::var("SPOTIFY_CLIENT_SECRET").ok()?;

    let res = match client
        .post("https://accounts.spotify.com/api/token")
        .basic_auth(&client_id, Some(&client_secret))
        .form(&[("grant_type", "client_credentials")])
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            error!(error = %e, "Failed to send request to Spotify token endpoint");
            return None;
        }
    };

    if !res.status().is_success() {
        error!(status = %res.status(), "Spotify token endpoint returned non-success status");
        return None;
    }

    match res.json::<TokenResponse>().await {
        Ok(token_res) => Some(token_res.access_token),
        Err(e) => {
            error!(error = %e, "Failed to parse Spotify token JSON response");
            None
        }
    }
}

/// Fetches ALL tracks from a Spotify Playlist by paginating 100 tracks at a time!
pub async fn resolve_spotify_playlist(client: &reqwest::Client, url: &str) -> Option<Vec<String>> {
    if !url.contains("open.spotify.com/playlist/") && !url.contains("spotify:playlist:") {
        return None;
    }

    let playlist_id = url.split("/playlist/").nth(1)?.split('?').next()?;

    let token = match get_spotify_api_token(client).await {
        Some(t) => t,
        None => {
            warn!("Could not retrieve Spotify API token. Check SPOTIFY_CLIENT_ID / SECRET env vars.");
            return None;
        }
    };

    let mut search_terms = Vec::new();
    let mut offset = 0;
    let limit = 100;

    debug!(playlist_id = %playlist_id, "Fetching Spotify playlist tracks via Web API");

    loop {
        let api_url = format!(
            "https://api.spotify.com/v1/playlists/{}/tracks?limit={}&offset={}",
            playlist_id, limit, offset
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

                    search_terms.push(format!("ytsearch:{} {}", artist_name, track_name).trim().to_string());
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
        debug!(count = search_terms.len(), "Successfully fetched all playlist tracks");
        Some(search_terms)
    }
}