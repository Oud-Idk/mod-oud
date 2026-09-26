//! Shared HTTP plumbing for the search providers.
//!
//! `reqwest::Error` includes the full request URL in its `Display`, and four providers
//! authenticate in the URL (`giphy`, `youtube`, `rawg` in the query string, `klipy` in the path).
//! `get_json` redacts the URL before logging and returns a generic error so the raw error, and
//! the key inside it, never reaches a log line or a user.
//!
//! It also records `status` and `latency_ms`, which no provider did before.

use crate::core::config::state::Error;
use reqwest::{RequestBuilder, StatusCode};
use serde::de::DeserializeOwned;
use std::time::Instant;
use tracing::{debug, error, warn};

/// Query-string parameter names that carry a credential.
const SECRET_QUERY_PARAMS: &[&str] = &[
    "api_key",
    "apikey",
    "api-key",
    "key",
    "app_key",
    "appkey",
    "token",
    "access_token",
];

/// Longest upstream error body kept for diagnosis.
const BODY_SNIPPET_CHARS: usize = 500;

/// Returns `url` with credentials removed so it is safe to log.
///
/// `path_secrets` is for providers that put the key in the path, which cannot be matched by
/// parameter name. If no query parameter survives, the whole query string is dropped.
#[must_use]
pub fn redact_url(url: &str, path_secrets: &[&str]) -> String {
    let mut redacted = url.to_string();
    for secret in path_secrets {
        if !secret.is_empty() {
            redacted = redacted.replace(secret, "<redacted>");
        }
    }

    let Some((path, query)) = redacted.split_once('?') else {
        return redacted;
    };

    let kept: Vec<&str> = query
        .split('&')
        .filter(|pair| {
            let key = pair.split('=').next().unwrap_or(pair);
            !SECRET_QUERY_PARAMS
                .iter()
                .any(|secret| secret.eq_ignore_ascii_case(key))
        })
        .collect();

    if kept.is_empty() {
        path.to_string()
    } else {
        format!("{path}?{}", kept.join("&"))
    }
}

/// Fetch and decode a JSON body from an upstream provider.
///
/// Errors are provider-scoped and generic on purpose. Detail goes to the log instead, because
/// the raw `reqwest::Error` carries the unredacted URL.
///
/// # Errors
/// Returns [`Err`] if the request fails, the status is not success, or the body will not decode.
pub async fn get_json<T: DeserializeOwned>(
    provider: &'static str,
    op: &'static str,
    url: &str,
    path_secrets: &[&str],
    request: RequestBuilder,
) -> Result<T, Error> {
    let started = Instant::now();
    let safe_url = redact_url(url, path_secrets);

    let response = request.send().await.map_err(|e| {
        error!(
            provider,
            op,
            url = %safe_url,
            error = ?e,
            "Upstream provider request failed before a response was received"
        );
        anyhow::anyhow!("{provider} is unavailable right now.")
    })?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        let snippet: String = body.chars().take(BODY_SNIPPET_CHARS).collect();

        if status == StatusCode::TOO_MANY_REQUESTS {
            warn!(
                provider,
                op,
                status = status.as_u16(),
                url = %safe_url,
                body = %snippet,
                "Upstream provider rate limited us, usually quota exhaustion"
            );
        } else {
            error!(
                provider,
                op,
                status = status.as_u16(),
                url = %safe_url,
                body = %snippet,
                "Upstream provider returned a non-success status"
            );
        }

        return Err(anyhow::anyhow!("{provider} is unavailable right now."));
    }

    let payload = response.json::<T>().await.map_err(|e| {
        error!(
            provider,
            op,
            status = status.as_u16(),
            url = %safe_url,
            error = ?e,
            "Upstream provider succeeded but the body did not decode, so their schema changed"
        );
        anyhow::anyhow!("{provider} returned an unexpected response.")
    })?;

    debug!(
        provider,
        op,
        status = status.as_u16(),
        url = %safe_url,
        latency_ms = started.elapsed().as_millis(),
        "Upstream provider request succeeded"
    );

    Ok(payload)
}

#[cfg(test)]
mod tests {
    use super::redact_url;

    #[test]
    fn drops_credential_query_params() {
        let redacted = redact_url(
            "https://api.giphy.com/v1/gifs/search?api_key=SUPERSECRET&q=cat&limit=1",
            &[],
        );
        assert!(!redacted.contains("SUPERSECRET"), "{redacted}");
        assert!(redacted.contains("q=cat"), "{redacted}");
        assert!(redacted.contains("limit=1"), "{redacted}");
    }

    #[test]
    fn drops_the_query_entirely_when_nothing_survives() {
        let redacted = redact_url("https://api.example.com/x?key=abc123", &[]);
        assert_eq!(redacted, "https://api.example.com/x");
    }

    #[test]
    fn redacts_path_secrets() {
        let redacted = redact_url(
            "https://api.klipy.com/api/v1/abc123/gifs/search?q=cat",
            &["abc123"],
        );
        assert!(!redacted.contains("abc123"), "{redacted}");
        assert!(redacted.contains("<redacted>"), "{redacted}");
    }

    #[test]
    fn leaves_a_url_without_a_query_untouched() {
        let url = "https://api.urbandictionary.com/v0/define?term=cat";
        assert_eq!(redact_url(url, &[]), url);
    }
}
