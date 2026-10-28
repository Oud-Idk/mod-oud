//! gRPC client for the toxicity classifier service.

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use ml_proto::toxicity::toxicity_classifier_client::ToxicityClassifierClient;
use ml_proto::toxicity::{ClassifyRequest, ReadyRequest};
use tonic::transport::{Channel, Endpoint};
use tracing::{debug, error, info};

use crate::core::config::state::AppConfig;
use crate::shared::task;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(2);
const READY_POLL_INTERVAL: Duration = Duration::from_secs(15);

/// Client for the ML inference service that scores message toxicity.
#[derive(Clone, Debug)]
pub struct ToxicClassifier {
    client: ToxicityClassifierClient<Channel>,
    ready: Arc<AtomicBool>,
}

impl ToxicClassifier {
    /// Builds a client from deployment config, or `None` when heavy features are off.
    #[must_use]
    pub fn from_config(config: &AppConfig) -> Option<Self> {
        if !config.heavy_features {
            info!("heavy features disabled, toxicity classifier off");
            return None;
        }

        let endpoint = &config.ml_inference_addr;
        let channel = match Endpoint::from_shared(endpoint.clone()) {
            Ok(endpoint) => endpoint.connect_timeout(CONNECT_TIMEOUT).connect_lazy(),
            Err(e) => {
                error!(error = %e, endpoint = %endpoint, "invalid ML inference address");
                return None;
            }
        };

        info!(%endpoint, "toxicity classifier client configured");
        Some(Self {
            client: ToxicityClassifierClient::new(channel),
            ready: Arc::new(AtomicBool::new(false)),
        })
    }

    /// Whether the service reported the model loaded at the last probe.
    #[must_use]
    pub fn is_ready(&self) -> bool {
        self.ready.load(Ordering::Relaxed)
    }

    /// Scores `text`, returning one probability per category.
    ///
    /// # Errors
    /// Returns the gRPC status when the service is unreachable or inference fails.
    pub async fn classify(&self, text: String) -> Result<HashMap<String, f32>, tonic::Status> {
        let mut client = self.client.clone();
        let response = client.classify(ClassifyRequest { text }).await?;
        Ok(response.into_inner().scores)
    }

    /// Polls the service so the hot path can skip the call while the model is unloaded.
    pub fn spawn_readiness_probe(&self) {
        let mut client = self.client.clone();
        let ready = Arc::clone(&self.ready);
        task::spawn("toxic_classifier_readiness", async move {
            loop {
                let current = match tokio::time::timeout(
                    CONNECT_TIMEOUT,
                    client.ready(ReadyRequest {}),
                )
                .await
                {
                    Ok(Ok(response)) => response.into_inner().ready,
                    Ok(Err(e)) => {
                        debug!(error = %e, "toxicity readiness probe failed");
                        false
                    }
                    Err(_) => {
                        debug!("toxicity readiness probe timed out");
                        false
                    }
                };

                if ready.swap(current, Ordering::Relaxed) != current {
                    if current {
                        info!("toxicity classifier ready");
                    } else {
                        info!("toxicity classifier unavailable");
                    }
                }

                tokio::time::sleep(READY_POLL_INTERVAL).await;
            }
        });
    }
}
