use crate::features::search::tmdb::models::{TmdbMediaType, TmdbMovieDetail, TmdbSearchResponse, TmdbTvDetail};

#[derive(Clone)]
pub struct TmdbClient {
    http: reqwest::Client,
    api_key: String,
    base_url: &'static str,
}

impl TmdbClient {
    pub fn new(http: reqwest::Client, api_key: impl Into<String>) -> Self {
        Self {
            http,
            api_key: api_key.into(),
            base_url: "https://api.themoviedb.org/3",
        }
    }

    /// Search movies or TV shows by title.
    pub async fn search(
        &self,
        media_type: TmdbMediaType,
        query: &str,
    ) -> Result<TmdbSearchResponse, reqwest::Error> {
        let endpoint = format!(
            "{}/search/{}",
            self.base_url,
            media_type.as_endpoint_path()
        );
        self.http
            .get(endpoint)
            .bearer_auth(&self.api_key)
            .query(&[("query", query), ("include_adult", "false")])
            .send()
            .await?
            .error_for_status()?
            .json::<TmdbSearchResponse>()
            .await
    }

    pub async fn get_movie_details(&self, id: u64) -> Result<TmdbMovieDetail, reqwest::Error> {
        let endpoint = format!("{}/movie/{}", self.base_url, id);
        self.http
            .get(endpoint)
            .bearer_auth(&self.api_key)
            .query(&[("append_to_response", "credits,videos")])
            .send()
            .await?
            .error_for_status()?
            .json::<TmdbMovieDetail>()
            .await
    }

    pub async fn get_tv_details(&self, id: u64) -> Result<TmdbTvDetail, reqwest::Error> {
        let endpoint = format!("{}/tv/{}", self.base_url, id);
        self.http
            .get(endpoint)
            .bearer_auth(&self.api_key)
            .query(&[("append_to_response", "credits,videos")])
            .send()
            .await?
            .error_for_status()?
            .json::<TmdbTvDetail>()
            .await
    }
}