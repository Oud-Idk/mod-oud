use serde::Deserialize;
use std::fmt::Write;
use tracing::{debug, warn};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlaylistItemListResponse {
    items: Option<Vec<PlaylistItem>>,
    next_page_token: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlaylistItem {
    snippet: Option<PlaylistItemSnippet>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlaylistItemSnippet {
    resource_id: Option<ResourceId>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResourceId {
    video_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VideoListResponse {
    items: Option<Vec<VideoItem>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VideoItem {
    snippet: Option<VideoSnippet>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VideoSnippet {}

/// Helper to extract `YouTube` Playlist ID from a URL or raw ID string.
fn extract_playlist_id(url: &str) -> Option<&str> {
    if url.contains("list=") {
        url.split("list=").nth(1)?.split('&').next()
    } else if !url.contains('/') && !url.contains('.') {
        Some(url) // Assume raw ID was passed directly
    } else {
        None
    }
}

/// Helper to extract `YouTube` Video ID from standard `YouTube`, Shorts, or shortened URLs.
fn extract_video_id(url: &str) -> Option<&str> {
    if url.contains("v=") {
        url.split("v=").nth(1)?.split('&').next()
    } else if url.contains("youtu.be/") {
        url.split("youtu.be/")
            .nth(1)?
            .split('?')
            .next()?
            .split('&')
            .next()
    } else if url.contains("shorts/") {
        url.split("shorts/")
            .nth(1)?
            .split('?')
            .next()?
            .split('&')
            .next()
    } else if !url.contains('/') && !url.contains('.') {
        Some(url)
    } else {
        None
    }
}

/// Fetches ALL video URLs from a `YouTube` Playlist by paginating 50 items at a time!
pub async fn resolve_youtube_playlist(
    client: &reqwest::Client,
    url: &str,
    api_key: &str,
) -> Option<Vec<String>> {
    if !url.contains("youtube") {
        return None;
    }

    let playlist_id = extract_playlist_id(url)?;

    let mut video_urls = Vec::new();
    let mut page_token: Option<String> = None;
    let max_results = 50; // YouTube Data API v3 limit per page

    debug!(playlist_id = %playlist_id, "Fetching YouTube playlist tracks via Data API v3");

    loop {
        let mut api_url = format!(
            "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults={max_results}&playlistId={playlist_id}&key={api_key}"
        );

        if let Some(token) = &page_token {
            let _ = write!(api_url, "&pageToken={token}");
        }

        let res = match client.get(&api_url).send().await {
            Ok(r) => r,
            Err(e) => {
                warn!(error = %e, "Network error while fetching YouTube playlist page");
                break;
            }
        };

        if !res.status().is_success() {
            warn!(status = %res.status(), "YouTube API returned error status for playlist");
            break;
        }

        // Get raw text response first for safe deserialization and debugging
        let body_text = match res.text().await {
            Ok(t) => t,
            Err(e) => {
                warn!(error = %e, "Failed to read response body text from YouTube API");
                break;
            }
        };

        // Safely deserialize
        let data: PlaylistItemListResponse = match serde_json::from_str(&body_text) {
            Ok(d) => d,
            Err(e) => {
                warn!(error = %e, raw_body = %body_text, "Failed to deserialize YouTube playlist JSON");
                break;
            }
        };

        let items = match data.items {
            Some(i) if !i.is_empty() => i,
            _ => break,
        };

        for item in &items {
            if let Some(snippet) = &item.snippet
                && let Some(resource_id) = &snippet.resource_id
                && let Some(video_id) = &resource_id.video_id
            {
                // Returns playable YouTube URL
                video_urls.push(format!("https://www.youtube.com/watch?v={video_id}"));
            }
        }

        // Check if a next page exists for pagination
        match data.next_page_token {
            Some(token) if !token.is_empty() => page_token = Some(token),
            _ => break,
        }
    }

    if video_urls.is_empty() {
        warn!(url = %url, "Failed to fetch videos from YouTube API or playlist was empty");
        None
    } else {
        debug!(
            count = video_urls.len(),
            "Successfully fetched all YouTube playlist tracks"
        );
        Some(video_urls)
    }
}

/// Resolves a single `YouTube` URL or ID into a canonical `YouTube` watch URL.
pub async fn resolve_youtube_video(
    client: &reqwest::Client,
    url: &str,
    api_key: &str,
) -> Option<String> {
    let video_id = extract_video_id(url)?;

    let api_url = format!(
        "https://www.googleapis.com/youtube/v3/videos?part=snippet&id={video_id}&key={api_key}"
    );

    let res = client.get(&api_url).send().await.ok()?;

    if !res.status().is_success() {
        warn!(status = %res.status(), video_id = %video_id, "YouTube API returned error for video");
        return None;
    }

    let data: VideoListResponse = res.json().await.ok()?;
    let items = data.items?;
    let video = items.first()?;
    let _snippet = video.snippet.as_ref()?;

    let watch_url = format!("https://www.youtube.com/watch?v={video_id}");

    debug!(url = %url, watch_url = %watch_url, "Resolved YouTube video via Data API v3");
    Some(watch_url)
}
