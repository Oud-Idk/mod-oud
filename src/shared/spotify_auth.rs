use serde::Deserialize;
use std::time::Duration;
use tokio::sync::RwLock;
use tokio::time::Instant;

/// Response from `Spotify` token endpoint.
#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: u64,
}

struct CachedToken {
    token: String,
    expires_at: Instant,
}

/// Thread-safe cache for the `Spotify` Client Credentials token.
///
/// Holds the access token and its expiry. Can be cloned via `Arc` and
/// stored in global state (`CoreServices` / `MusicState` / `WebState`) so
/// any feature can reuse the same token without re-authenticating.
pub struct SpotifyAuthCache {
    cache: RwLock<Option<CachedToken>>,
}

impl SpotifyAuthCache {
    /// Creates a new empty cache.
    #[must_use]
    pub const fn new() -> Self {
        Self {
            cache: RwLock::const_new(None),
        }
    }

    /// Returns a valid `Spotify` access token, reusing the cached value when
    /// it has more than 1 minute of validity remaining.
    ///
    /// Fetches a fresh token via Client Credentials flow when the cache is
    /// empty or expiring. Returns `None` if credentials are missing or the
    /// token endpoint fails.
    pub async fn get_token(&self, client: &reqwest::Client) -> Option<String> {
        {
            let cache = self.cache.read().await;
            if let Some(cached) = cache.as_ref()
                && cached.expires_at > Instant::now() + Duration::from_mins(1)
            {
                return Some(cached.token.clone());
            }
        }

        let client_id = std::env::var("SPOTIFY_CLIENT_ID").ok()?;
        let client_secret = std::env::var("SPOTIFY_CLIENT_SECRET").ok()?;

        let res = client
            .post("https://accounts.spotify.com/api/token")
            .basic_auth(&client_id, Some(&client_secret))
            .form(&[("grant_type", "client_credentials")])
            .send()
            .await
            .ok()?;

        let token_res: TokenResponse = res.json().await.ok()?;

        {
            let mut cache = self.cache.write().await;
            *cache = Some(CachedToken {
                token: token_res.access_token.clone(),
                expires_at: Instant::now()
                    + Duration::from_secs(token_res.expires_in.saturating_sub(60)),
            });
        }

        Some(token_res.access_token)
    }
}

impl Default for SpotifyAuthCache {
    fn default() -> Self {
        Self::new()
    }
}
