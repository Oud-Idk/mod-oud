use super::models::RawgResponse;

use crate::core::config::state::Error;
use crate::features::search::http;

/// Recorded on every upstream log line.
const PROVIDER: &str = "rawg";

#[derive(Clone)]
pub struct RawgClient {
    http: reqwest::Client,
    api_key: String,
    base_url: &'static str,
}

impl RawgClient {
    pub fn new(http: reqwest::Client, api_key: impl Into<String>) -> Self {
        Self {
            http,
            api_key: api_key.into(),
            base_url: "https://api.rawg.io/api",
        }
    }

    /// Search RAWG for games with a custom page size limit
    pub async fn search_games(
        &self,
        query: &str,
        page_size: Option<usize>,
    ) -> Result<RawgResponse, Error> {
        let size_str = page_size.unwrap_or(1).to_string();
        let url = format!("{}/games", self.base_url);

        // The key rides in the query string, so the URL must never be logged unredacted.
        http::get_json(
            PROVIDER,
            "search",
            &url,
            &[],
            self.http.get(&url).query(&[
                ("key", self.api_key.as_str()),
                ("search", query),
                ("page_size", size_str.as_str()),
                ("search_precise", "true"),
            ]),
        )
        .await
    }
}
