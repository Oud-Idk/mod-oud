use super::models::{SearchResult, WikiSummary};
use reqwest::StatusCode;

#[derive(Clone)]
pub struct WikipediaClient {
    http: reqwest::Client,
    base_url: &'static str,
}

impl WikipediaClient {
    pub const fn new(http: reqwest::Client) -> Self {
        Self {
            http,
            base_url: "https://en.wikipedia.org/api/rest_v1",
        }
    }

    /// Fetch a Wikipedia summary directly by title or key.
    /// Returns `Ok(None)` if the page was not found (404).
    pub async fn summary(&self, term: &str) -> Result<Option<WikiSummary>, reqwest::Error> {
        let response = self
            .http
            .get(format!("{}/page/summary/{}", self.base_url, term))
            .send()
            .await?;

        if response.status() == StatusCode::NOT_FOUND {
            return Ok(None);
        }

        let summary = response.error_for_status()?.json::<WikiSummary>().await?;
        Ok(Some(summary))
    }

    /// Search Wikipedia and return the `key` of the first matching article.
    pub async fn search_first_page(&self, query: &str) -> Result<Option<String>, reqwest::Error> {
        let response = self
            .http
            .get("https://en.wikipedia.org/w/rest.php/v1/search/page")
            .query(&[("q", query), ("limit", "1")])
            .send()
            .await?
            .error_for_status()?
            .json::<SearchResult>()
            .await?;

        Ok(response.pages.into_iter().next().map(|page| page.key))
    }

    /// Tries an exact match first; if not found, searches and gets the summary of the first hit.
    pub async fn get_or_search(&self, query: &str) -> Result<Option<WikiSummary>, reqwest::Error> {
        if let Some(summary) = self.summary(query).await? {
            return Ok(Some(summary));
        }

        if let Some(first_key) = self.search_first_page(query).await? {
            return self.summary(&first_key).await;
        }

        Ok(None)
    }
}