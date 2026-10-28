//! ML inference service: loads the toxicity model once and serves it over gRPC.

mod model;
mod service;

use std::net::SocketAddr;
use std::sync::{Arc, OnceLock};
use std::time::Duration;

use anyhow::Context;
use hf_hub::HFClient;
use ml_proto::toxicity::toxicity_classifier_server::ToxicityClassifierServer;
use tracing::{error, info, warn};
use tracing_subscriber::EnvFilter;

use crate::model::{SharedClassifier, ToxicClassifier};

/// Address the service binds when `ML_INFERENCE_LISTEN_ADDR` is unset.
const DEFAULT_LISTEN_ADDR: &str = "0.0.0.0:50051";
const MODEL_ORGANIZATION: &str = "onnx-community";
const MODEL_NAME: &str = "unbiased-toxic-roberta-ONNX";
/// A failed download is usually a transient network fault, so the load retries.
const LOAD_RETRY_DELAY: Duration = Duration::from_secs(60);

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    init_logging();

    let addr: SocketAddr = std::env::var("ML_INFERENCE_LISTEN_ADDR")
        .unwrap_or_else(|_| DEFAULT_LISTEN_ADDR.to_owned())
        .parse()
        .context("ML_INFERENCE_LISTEN_ADDR is not a socket address")?;

    // Serving starts before the model loads so `Ready` can report progress.
    let classifier: SharedClassifier = Arc::new(OnceLock::new());
    tokio::spawn(load_model(Arc::clone(&classifier)));

    let max_concurrent = std::thread::available_parallelism().map_or(1, std::num::NonZero::get);
    let service = service::ToxicityService::new(Arc::clone(&classifier), max_concurrent);

    info!(%addr, max_concurrent, "toxicity service listening");
    tonic::transport::Server::builder()
        .add_service(ToxicityClassifierServer::new(service))
        .serve_with_shutdown(addr, shutdown_signal())
        .await
        .context("gRPC server failed")?;

    info!("toxicity service stopped");
    Ok(())
}

/// Downloads the model and retries until it loads, since a missing model leaves the service useless.
async fn load_model(classifier: SharedClassifier) {
    let loaded = loop {
        match load_once().await {
            Ok(model) => break model,
            Err(e) => warn!(error = %e, "toxicity model load failed; retrying"),
        }
        tokio::time::sleep(LOAD_RETRY_DELAY).await;
    };

    if classifier.set(loaded).is_err() {
        error!(
            fault = "classifier already set",
            "toxicity model initialized twice"
        );
        return;
    }

    info!("toxicity model loaded");
}

async fn load_once() -> anyhow::Result<ToxicClassifier> {
    info!(
        organization = MODEL_ORGANIZATION,
        model = MODEL_NAME,
        "downloading toxicity model"
    );

    let client = HFClient::new().context("hf client creation failed")?;
    let repo = client.model(MODEL_ORGANIZATION.to_owned(), MODEL_NAME.to_owned());

    let model_path = repo
        .download_file()
        .filename("onnx/model.onnx")
        .send()
        .await
        .context("model download failed")?;
    let tokenizer_path = repo
        .download_file()
        .filename("tokenizer.json")
        .send()
        .await
        .context("tokenizer download failed")?;

    tokio::task::spawn_blocking(move || ToxicClassifier::load(&model_path, &tokenizer_path))
        .await
        .context("model load task failed")?
}

fn init_logging() {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::fmt().with_env_filter(filter).init();
}

/// Resolves on SIGTERM or SIGINT so the container stops without dropping in-flight work.
async fn shutdown_signal() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{SignalKind, signal};

        if let Ok(mut terminate) = signal(SignalKind::terminate()) {
            tokio::select! {
                _ = terminate.recv() => {}
                _ = tokio::signal::ctrl_c() => {}
            }
            return;
        }
    }

    if let Err(e) = tokio::signal::ctrl_c().await {
        error!(error = %e, "shutdown signal listener failed");
    }
}
