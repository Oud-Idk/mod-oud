//! gRPC surface over the toxicity model.

use std::sync::Arc;

use ml_proto::toxicity::toxicity_classifier_server::ToxicityClassifier as ToxicityClassifierService;
use ml_proto::toxicity::{ClassifyRequest, ClassifyResponse, ReadyRequest, ReadyResponse};
use tokio::sync::Semaphore;
use tonic::{Request, Response, Status};

use crate::model::SharedClassifier;

/// Serves inference requests against a model that loads in the background.
pub struct ToxicityService {
    classifier: SharedClassifier,
    inference_slots: Arc<Semaphore>,
}

impl ToxicityService {
    /// Builds the service. `max_concurrent` caps how many inferences run at once.
    #[must_use]
    pub fn new(classifier: SharedClassifier, max_concurrent: usize) -> Self {
        Self {
            classifier,
            inference_slots: Arc::new(Semaphore::new(max_concurrent)),
        }
    }
}

#[tonic::async_trait]
impl ToxicityClassifierService for ToxicityService {
    async fn classify(
        &self,
        request: Request<ClassifyRequest>,
    ) -> Result<Response<ClassifyResponse>, Status> {
        if self.classifier.get().is_none() {
            return Err(Status::unavailable("model not loaded"));
        }

        let classifier = self.classifier.clone();

        let text = request.into_inner().text;
        let permit = self
            .inference_slots
            .clone()
            .acquire_owned()
            .await
            .map_err(|_| Status::internal("inference queue closed"))?;

        // RoBERTa inference is CPU-bound, so it runs on the blocking pool with a permit held.
        let scores = tokio::task::spawn_blocking(move || {
            let _permit = permit;
            let c = classifier.get().expect("classifier mustn't be none, checked above");
            c.predict(&text)
        })
        .await
        .map_err(|e| Status::internal(format!("inference task failed: {e}")))?
        .map_err(|e| Status::internal(format!("inference failed: {e}")))?;

        Ok(Response::new(ClassifyResponse { scores }))
    }

    async fn ready(
        &self,
        _request: Request<ReadyRequest>,
    ) -> Result<Response<ReadyResponse>, Status> {
        Ok(Response::new(ReadyResponse {
            ready: self.classifier.get().is_some(),
        }))
    }
}
