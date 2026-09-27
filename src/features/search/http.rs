//! Shared HTTP plumbing for the search providers.
//!
//! Four providers authenticate in the URL (`giphy`, `youtube`, `rawg` in the query string,
//! `klipy` in the path), and `reqwest::Error` embeds that URL in both its `Display` and its
//! `Debug`. So `get_json` logs a redacted url and a described error, and returns a generic one,
//! which is the only way the key stays out of the log and out of a user-facing message.
//!
//! It also records `status` and `latency_ms`, which no provider did before.

use crate::core::config::state::Error;
use crate::shared::http::{redact_url, safe_reqwest_error};
use reqwest::{RequestBuilder, StatusCode};
use serde::de::DeserializeOwned;
use std::time::Instant;
use tracing::{debug, warn};

/// Longest upstream error body kept for diagnosis.
const BODY_SNIPPET_CHARS: usize = 500;

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
        warn!(
            provider,
            op,
            url = %safe_url,
            error = %safe_reqwest_error(&e),
            "upstream provider request failed before a response was received"
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
                "upstream provider rate limited us, usually quota exhaustion"
            );
        } else {
            warn!(
                provider,
                op,
                reason = status.as_u16(),
                url = %safe_url,
                body = %snippet,
                "upstream provider returned a non-success status"
            );
        }

        return Err(anyhow::anyhow!("{provider} is unavailable right now."));
    }

    let payload = response.json::<T>().await.map_err(|e| {
        warn!(
            provider,
            op,
            status = status.as_u16(),
            url = %safe_url,
            error = %safe_reqwest_error(&e),
            "upstream provider succeeded but the body did not decode, so their schema changed"
        );
        anyhow::anyhow!("{provider} returned an unexpected response.")
    })?;

    debug!(
        provider,
        op,
        status = status.as_u16(),
        url = %safe_url,
        latency_ms = started.elapsed().as_millis(),
        "upstream provider request succeeded"
    );

    Ok(payload)
}

