use crate::features::search::wordnik::models::{WordOfTheDay, WordnikDefinition};

#[derive(Clone)]
pub struct WordnikClient {
    http: reqwest::Client,
    base_url: &'static str,
    api_key: String,
}

impl WordnikClient {
    pub const fn new(http: reqwest::Client, api_key: String) -> Self {
        Self {
            http,
            base_url: "https://api.wordnik.com/v4",
            api_key,
        }
    }

    /// Search for a word/term definition
    pub async fn define(
        &self,
        term: &str,
        limit: usize,
    ) -> Result<Vec<WordnikDefinition>, reqwest::Error> {
        let params = [
            ("limit", limit.to_string()),
            ("includeRelated", "false".to_string()),
            ("useCanonical", "true".to_string()),
        ];

        let response = self
            .http
            .get(format!("{}/word.json/{}/definitions", self.base_url, term))
            .header("api_key", &self.api_key)
            .query(&params)
            .send()
            .await?
            .error_for_status()?
            .json::<Vec<WordnikDefinition>>()
            .await?;

        Ok(response)
    }

    pub async fn word_of_the_day(
        &self,
        date: Option<&str>,
    ) -> Result<WordOfTheDay, reqwest::Error> {
        let mut request = self
            .http
            .get(format!("{}/words.json/wordOfTheDay", self.base_url))
            .header("api_key", &self.api_key);

        if let Some(date_str) = date {
            request = request.query(&[("date", date_str)]);
        }

        let response = request
            .send()
            .await?
            .error_for_status()?
            .json::<WordOfTheDay>()
            .await?;

        Ok(response)
    }
}
