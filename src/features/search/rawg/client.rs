use super::models::RawgResponse;

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
    ) -> Result<RawgResponse, reqwest::Error> {
        let size_str = page_size.unwrap_or(1).to_string();

        let response = self
            .http
            .get(format!("{}/games", self.base_url))
            .query(&[
                ("key", self.api_key.as_str()),
                ("search", query),
                ("page_size", size_str.as_str()),
                ("search_precise", "true"),
            ])
            .send()
            .await?
            .error_for_status()?
            .json::<RawgResponse>()
            .await?;

        Ok(response)
    }
}