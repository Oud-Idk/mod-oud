use anyhow::{Result, bail};
use prost::Message;
use std::time::Duration;
use tracing::{debug, error, instrument, trace};

/// A client for interacting with the Google Safe Browsing API (v5).
#[derive(Debug, Clone)]
pub struct SafeBrowsingClient {
    api_key: String,
    http_client: reqwest::Client,
}

impl SafeBrowsingClient {
    /// Creates a new [`SafeBrowsingClient`] configured with the given API key and default request timeouts.
    #[must_use]
    pub fn new(api_key: String) -> Self {
        let http_client = reqwest::Client::builder()
            .timeout(Duration::from_secs(3)) // Max 3-second wait
            .connect_timeout(Duration::from_secs(2))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        Self {
            api_key,
            http_client,
        }
    }

    /// Checks a batch of URLs against the Safe Browsing database and returns recognized threat types.
    ///
    /// # Errors
    ///
    /// Returns `Err` if:
    /// - The HTTP network request fails or times out.
    /// - The Safe Browsing API responds with a non-success HTTP status code.
    /// - The response payload fails to decode into a [`SearchUrlsResponse`] Protobuf message.
    #[instrument(
        name = "safebrowsing_client::check_urls",
        skip(self, urls),
        fields(url_count = urls.len()),
        err
    )]
    pub async fn check_urls(&self, urls: &[&str]) -> Result<Vec<i32>> {
        let endpoint = "https://safebrowsing.googleapis.com/v5/urls:search";
        let mut query_params = vec![("key".to_string(), self.api_key.clone())];
        for url in urls {
            query_params.push(("urls".to_string(), (*url).to_string()));
        }

        trace!("Sending GET request to Safe Browsing API");
        let response = self
            .http_client
            .get(endpoint)
            .query(&query_params)
            .send()
            .await?;

        let status = response.status();
        if !status.is_success() {
            let err_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unreadable body".to_string());
            error!(
                status = %status,
                error_body = %err_text,
                "Safe Browsing API returned an error status"
            );
            bail!(format!("Safe Browsing API Error: {err_text}"));
        }

        trace!("Reading payload response bytes");
        let bytes = response.bytes().await?;

        trace!("Decoding Protobuf response payload");
        let search_response = SearchUrlsResponse::decode(bytes).map_err(|e| {
            error!(error = %e, "Failed to deserialize Safe Browsing Protobuf response");
            e
        })?;

        let mut threat_types = Vec::new();
        for threat in search_response.threats {
            threat_types.extend(threat.threat_types);
        }

        debug!(
            threats_found = threat_types.len(),
            "Successfully completed Safe Browsing check"
        );
        Ok(threat_types)
    }
}

/// A Protocol Buffers representation of a duration of time.
#[derive(Clone, PartialEq, Eq, Message)]
pub struct PbDuration {
    /// Signed seconds of the span of time.
    #[prost(int64, tag = "1")]
    pub seconds: i64,
    /// Signed fractions of a second at nanosecond resolution (from 0 to 999,999,999).
    #[prost(int32, tag = "2")]
    pub nanos: i32,
}

/// The response payload returned by the Safe Browsing `urls:search` endpoint.
#[derive(Clone, PartialEq, Eq, Message)]
pub struct SearchUrlsResponse {
    /// The list of identified threats for the queried URLs.
    #[prost(message, repeated, tag = "1")]
    pub threats: Vec<ThreatUrl>,
    /// The duration for which clients may cache this response.
    #[prost(message, optional, tag = "2")]
    pub cache_duration: Option<PbDuration>,
}

/// Represents an identified threat associated with a specific URL.
#[derive(Clone, PartialEq, Eq, Message)]
pub struct ThreatUrl {
    /// The URL matching a Safe Browsing threat list entry.
    #[prost(string, tag = "1")]
    pub url: String,
    /// The list of threat type integer identifiers matching this URL.
    #[prost(int32, repeated, tag = "2")]
    pub threat_types: Vec<i32>,
}
