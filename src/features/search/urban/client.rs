use super::models::UrbanResponse;

#[derive(Clone)]
pub struct UrbanClient {
    http: reqwest::Client,
    base_url: &'static str,
}

impl UrbanClient {
    pub const fn new(http: reqwest::Client) -> Self {
        Self {
            http,
            base_url: "https://api.urbandictionary.com/v0",
        }
    }

    /// Search for a word/term definition
    pub async fn define(&self, term: &str) -> Result<UrbanResponse, reqwest::Error> {
        let response = self
            .http
            .get(format!("{}/define", self.base_url))
            .query(&[("term", term)])
            .send()
            .await?
            .error_for_status()?
            .json::<UrbanResponse>()
            .await?;

        Ok(response)
    }
}
