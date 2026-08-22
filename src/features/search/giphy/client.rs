use super::models::GiphyResponse;

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
    pub async fn search_gif(
        &self,
        query: &str,
        limit: Option<usize>,
    ) -> Result<GiphyResponse, reqwest::Error> {
        let limit_str = limit.unwrap_or(1).to_string();

        let response = self
            .http
            .get(format!("{}/search", self.base_url))
            .query(&[
                ("api_key", self.api_key.as_str()),
                ("q", query),
                ("limit", limit_str.as_str()),
                ("rating", "g"),
            ])
            .send()
            .await?
            .error_for_status()?
            .json::<GiphyResponse>()
            .await?;

        Ok(response)
    }
}
