use super::models::GiphyResponse;
use crate::core::config::state::Error;
use crate::features::search::http;

/// Provider identifier recorded on every upstream log line.
const PROVIDER: &str = "giphy";

#[derive(Clone)]
pub struct GiphyClient {
    http: reqwest::Client,
    api_key: String,
    base_url: &'static str,
}

impl GiphyClient {
    pub fn new(http: reqwest::Client, api_key: impl Into<String>) -> Self {
        Self {
            http,
            api_key: api_key.into(),
            base_url: "https://api.giphy.com/v1/gifs",
        }
    }

    /// Search GIPHY with custom limit
    ///
    /// # Errors
    /// Returns [`Err`] if Giphy is unreachable, rate-limits us, or changes its response schema.
    pub async fn search_gif(
        &self,
        query: &str,
        limit: Option<usize>,
    ) -> Result<GiphyResponse, Error> {
        let limit_str = limit.unwrap_or(1).to_string();
        let url = format!("{}/search", self.base_url);

        // `api_key` rides in the query string, so the URL must never be logged unredacted.
        http::get_json(
            PROVIDER,
            "search",
            &url,
            &[],
            self.http.get(&url).query(&[
                ("api_key", self.api_key.as_str()),
                ("q", query),
                ("limit", limit_str.as_str()),
                ("rating", "g"),
            ]),
        )
        .await
    }
}
