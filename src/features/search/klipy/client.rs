use crate::features::search::klipy::models::{KlipyMediaType, KlipyResponse};

use crate::core::config::state::Error;
use crate::features::search::http;

/// Provider identifier recorded on every upstream log line.
const PROVIDER: &str = "klipy";

#[derive(Clone)]
pub struct KlipyClient {
    http: reqwest::Client,
    app_key: String,
    base_url: &'static str,
}

impl KlipyClient {
    pub fn new(http: reqwest::Client, app_key: impl Into<String>) -> Self {
        Self {
            http,
            app_key: app_key.into(),
            base_url: "https://api.klipy.com/api/v1",
        }
    }

    /// Search across GIFs, Memes, Stickers, or Clips
    pub async fn search(
        &self,
        media_type: KlipyMediaType,
        query: &str,
        per_page: usize,
    ) -> Result<KlipyResponse, Error> {
        let endpoint = format!(
            "{}/{}/{}/search",
            self.base_url,
            self.app_key,
            media_type.as_endpoint_path()
        );

        let per_page_str = per_page.to_string();

        // Klipy puts the app key in the path, so `redact_url` cannot match it by name.
        http::get_json(
            PROVIDER,
            "search",
            &endpoint,
            &[self.app_key.as_str()],
            self.http.get(&endpoint).query(&[
                ("q", query),
                ("per_page", per_page_str.as_str()),
                ("page", "1"),
            ]),
        )
        .await
    }
}
