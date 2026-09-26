use super::models::YouTubeSearchResponse;

use crate::core::config::state::Error;
use crate::features::search::http;

/// Recorded on every upstream log line.
const PROVIDER: &str = "youtube";

#[derive(Clone)]
pub struct YouTubeClient {
    http: reqwest::Client,
    api_key: String,
    base_url: &'static str,
}

impl YouTubeClient {
    pub fn new(http: reqwest::Client, api_key: impl Into<String>) -> Self {
        Self {
            http,
            api_key: api_key.into(),
            base_url: "https://www.googleapis.com/youtube/v3",
        }
    }

    /// Search for `YouTube` videos
    pub async fn search_videos(
        &self,
        query: &str,
        max_results: usize,
    ) -> Result<YouTubeSearchResponse, Error> {
        let max_results_str = max_results.to_string();
        let url = format!("{}/search", self.base_url);

        // The key rides in the query string, so the URL must never be logged unredacted.
        http::get_json(
            PROVIDER,
            "search",
            &url,
            &[],
            self.http.get(&url).query(&[
                ("key", self.api_key.as_str()),
                ("part", "snippet"),
                ("type", "video"),
                ("q", query),
                ("maxResults", max_results_str.as_str()),
            ]),
        )
        .await
    }
}
