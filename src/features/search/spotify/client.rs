use crate::features::search::spotify::models::SpotifySearchResponse;
use crate::shared::spotify_auth::SpotifyAuthCache;

#[derive(Clone)]
pub struct SpotifyClient<'a> {
    http: &'a reqwest::Client,
    auth_cache: &'a SpotifyAuthCache,
    base_url: &'static str,
}

impl<'a> SpotifyClient<'a> {
    pub const fn new(http: &'a reqwest::Client, auth_cache: &'a SpotifyAuthCache) -> Self {
        Self {
            http,
            auth_cache,
            base_url: "https://api.spotify.com/v1",
        }
    }

    /// Searches for tracks using the cached bearer token
    pub async fn search_track(
        &self,
        query: &str,
        limit: usize,
    ) -> anyhow::Result<SpotifySearchResponse> {
        let token = self
            .auth_cache
            .get_token(self.http)
            .await
            .ok_or_else(|| anyhow::anyhow!("Failed to acquire Spotify access token."))?;

        let limit_str = limit.to_string();

        let response = self
            .http
            .get(format!("{}/search", self.base_url))
            .bearer_auth(token)
            .query(&[
                ("q", query),
                ("type", "track"),
                ("limit", limit_str.as_str()),
            ])
            .send()
            .await?
            .error_for_status()?
            .json::<SpotifySearchResponse>()
            .await?;

        Ok(response)
    }
}
