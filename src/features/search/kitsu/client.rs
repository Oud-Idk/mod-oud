use crate::features::search::kitsu::models::{KitsuMangaResponse, KitsuResponse};
use axum::http::header::{ACCEPT, CONTENT_TYPE};

#[derive(Clone)]
pub struct KitsuClient {
    http: reqwest::Client,
    base_url: &'static str,
}

impl KitsuClient {
    /// Wrap around your bot's shared reqwest client
    pub const fn new(http: reqwest::Client) -> Self {
        Self {
            http,
            base_url: "https://kitsu.io/api/edge",
        }
    }

    /// Search anime by title
    pub async fn search_anime(
        &self,
        query: &str,
        limit: Option<usize>,
    ) -> Result<KitsuResponse, reqwest::Error> {
        let limit_str = limit.unwrap_or(5).to_string();

        let response = self
            .http
            .get(format!("{}/anime", self.base_url))
            .header(ACCEPT, "application/vnd.api+json")
            .header(CONTENT_TYPE, "application/vnd.api+json")
            .query(&[
                ("filter[text]", query),
                ("include", "categories"),
                ("page[limit]", &limit_str),
            ])
            .send()
            .await?
            .error_for_status()?
            .json::<KitsuResponse>()
            .await?;

        Ok(response)
    }

    /// Search manga by title
    pub async fn search_manga(
        &self,
        query: &str,
        limit: Option<usize>,
    ) -> Result<KitsuMangaResponse, reqwest::Error> {
        let limit_str = limit.unwrap_or(5).to_string();

        let response = self
            .http
            .get(format!("{}/manga", self.base_url))
            .header(ACCEPT, "application/vnd.api+json")
            .header(CONTENT_TYPE, "application/vnd.api+json")
            .query(&[
                ("filter[text]", query),
                ("include", "categories"), // 👈 Pulls genres/tags
                ("page[limit]", &limit_str),
            ])
            .send()
            .await?
            .error_for_status()?
            .json::<KitsuMangaResponse>()
            .await?;

        Ok(response)
    }
}
