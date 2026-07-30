use crate::Error;
use prost::Message;
use std::time::Duration;
use tracing::{debug, error, instrument, trace};

#[derive(Debug, Clone)]
pub struct SafeBrowsingClient {
    api_key: String,
    http_client: reqwest::Client,
}

impl SafeBrowsingClient {
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

    /// Checks a batch of URLs and returns recognized threats
    #[instrument(
        name = "safebrowsing_client::check_urls",
        skip(self, urls),
        fields(url_count = urls.len()),
        err
    )]
    pub async fn check_urls(&self, urls: &[&str]) -> Result<Vec<i32>, Error> {
        let endpoint = "https://safebrowsing.googleapis.com/v5/urls:search";
        let mut query_params = vec![("key".to_string(), self.api_key.clone())];
        for url in urls {
            query_params.push(("urls".to_string(), url.to_string()));
        }

        trace!("Sending GET request to Safe Browsing API");
        let response = self.http_client.get(endpoint).query(&query_params).send().await?;

        let status = response.status();
        if !status.is_success() {
            let err_text = response.text().await.unwrap_or_else(|_| "Unreadable body".to_string());
            error!(
                status = %status,
                error_body = %err_text,
                "Safe Browsing API returned an error status"
            );
            return Err(format!("Safe Browsing API Error: {}", err_text).into());
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

#[derive(Clone, PartialEq, Message)]
pub struct PbDuration {
    #[prost(int64, tag = "1")]
    pub seconds: i64,
    #[prost(int32, tag = "2")]
    pub nanos: i32,
}

#[derive(Clone, PartialEq, Message)]
pub struct SearchUrlsResponse {
    #[prost(message, repeated, tag = "1")]
    pub threats: Vec<ThreatUrl>,
    #[prost(message, optional, tag = "2")]
    pub cache_duration: Option<PbDuration>,
}

#[derive(Clone, PartialEq, Message)]
pub struct ThreatUrl {
    #[prost(string, tag = "1")]
    pub url: String,
    #[prost(int32, repeated, tag = "2")]
    pub threat_types: Vec<i32>,
}