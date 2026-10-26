use std::collections::HashMap;
use std::path::Path;
use std::sync::{Mutex, OnceLock};

use crate::features::automod::types::TOXIC_CATEGORIES;
use crate::shared::task;
use hf_hub::HFClient;
use ort::session::{Session, builder::GraphOptimizationLevel};
use ort::value::Tensor;
use tokenizers::tokenizer::Tokenizer;
use tokio::sync::{mpsc, oneshot};
use tracing::{error, info};

static CLASSIFIER: OnceLock<ToxicClassifier> = OnceLock::new();

/// A wrapper around the ONNX model session and tokenizer for toxicity analysis.
#[derive(Debug)]
pub struct ToxicClassifier {
    tokenizer: Tokenizer,
    session: Mutex<Session>,
}

/// A request job sent to the toxic classification background worker.
pub struct ToxicClassifierJob {
    /// The input text content to evaluate.
    pub text: String,
    /// The channel used to send back the toxicity scores or an error description.
    pub respond_to: oneshot::Sender<Result<HashMap<String, f32>, String>>,
}

impl ToxicClassifier {
    /// Loads the ONNX model and tokenizer from disk and initializes the runtime.
    pub fn new<P: AsRef<Path>>(model_path: P, tokenizer_path: P) -> Result<Self, anyhow::Error> {
        let mut tokenizer = Tokenizer::from_file(tokenizer_path)
            .map_err(|e| anyhow::anyhow!("Failed to load tokenizer: {e}"))?;
        tokenizer
            .with_truncation(Some(tokenizers::TruncationParams {
                max_length: 512,
                ..Default::default()
            }))
            .map_err(|e| anyhow::anyhow!("Failed to set truncation: {e}"))?;

        let env = ort::init()
            .build()
            .map_err(|e| anyhow::anyhow!("Failed to init ort env: {e}"))?;

        let session = Session::builder(&env)
            .map_err(|e| anyhow::anyhow!("Failed to create builder: {e}"))?
            .with_optimization_level(GraphOptimizationLevel::Level3)
            .map_err(|e| anyhow::anyhow!("Failed to set opt level: {e}"))?
            .with_intra_threads(1)
            .map_err(|e| anyhow::anyhow!("Failed to set threads: {e}"))?
            .commit_from_file(model_path)
            .map_err(|e| anyhow::anyhow!("Failed to load model: {e}"))?;

        Ok(Self {
            tokenizer,
            session: Mutex::new(session),
        })
    }

    /// Evaluates the input string and returns a map of toxicity labels to probability scores.
    pub fn predict(&self, text: &str) -> Result<HashMap<String, f32>, anyhow::Error> {
        let encoding = self
            .tokenizer
            .encode(text, true)
            .map_err(|e| anyhow::anyhow!("Failed to encode token: {e}"))?;

        let input_ids: Vec<i64> = encoding.get_ids().iter().map(|&id| i64::from(id)).collect();
        let attention_mask: Vec<i64> = encoding
            .get_attention_mask()
            .iter()
            .map(|&m| i64::from(m))
            .collect();
        let len = input_ids.len();

        let shape = [1_usize, len];
        let input_ids_tensor = Tensor::from_array((shape, input_ids.into_boxed_slice()))?;
        let mask_tensor = Tensor::from_array((shape, attention_mask.into_boxed_slice()))?;

        let mut session = self
            .session
            .lock()
            .map_err(|_| anyhow::anyhow!("Session mutex poisoned"))?;

        let logits = {
            let outputs = session.run(ort::inputs![
                "input_ids" => input_ids_tensor,
                "attention_mask" => mask_tensor,
            ])?;
            outputs[0].try_extract_tensor::<f32>()?.1.to_vec()
        };
        drop(session);

        let mut scores = HashMap::with_capacity(TOXIC_CATEGORIES.len());
        for (label, &logit) in TOXIC_CATEGORIES.iter().zip(&logits) {
            scores.insert((*label).to_string(), 1.0 / (1.0 + (-logit).exp()));
        }

        Ok(scores)
    }
}

/// Whether the ONNX model has finished loading and can serve requests.
#[must_use]
pub fn is_ready() -> bool {
    CLASSIFIER.get().is_some()
}

/// Spawns the background worker task that listens for incoming [`ToxicClassifierJob`] requests.
pub fn start_toxic_classifier_job(rx: mpsc::Receiver<ToxicClassifierJob>) {
    task::spawn("toxic_classifier_worker", toxic_classifier_job(rx));
}

async fn toxic_classifier_job(mut rx: mpsc::Receiver<ToxicClassifierJob>) {
    info!("toxic classifier worker started");

    while let Some(job) = rx.recv().await {
        if let Some(c) = CLASSIFIER.get() {
            let prediction = c.predict(job.text.as_str()).map_err(|e| e.to_string());
            let _ = job.respond_to.send(prediction);
        } else {
            error!(
                fault = "classifier not loaded",
                "toxic classifier not yet set up"
            );
            let _ = job.respond_to.send(Err("Model not yet loaded".to_string()));
        }
    }
}

/// Downloads model weights and initializes the classifier if `ENABLE_HEAVY_FEAT` is set.
pub fn setup_toxic_ml() {
    let toxicity_enabled = std::env::var("ENABLE_HEAVY_FEAT")
        .unwrap_or_else(|_| "false".to_string())
        .to_lowercase()
        == "true";

    if !toxicity_enabled {
        info!("heavy feature not explicitly set. Skipping loading RoBERTa model");
        return;
    }

    tokio::spawn(async move {
        info!("downloading RoBERTa model...");

        let client = match HFClient::new() {
            Ok(c) => c,
            Err(e) => {
                error!(error = %e, "hf client creation failed");
                return;
            }
        };

        let organization = "onnx-community";
        let model_name = "unbiased-toxic-roberta-ONNX";
        let repo = client.model(organization.to_string(), model_name.to_string());

        info!(organization, model_name, "fetching model files");
        let model_res = repo
            .download_file()
            .filename("onnx/model.onnx")
            .send()
            .await;
        let tokenizer_res = repo.download_file().filename("tokenizer.json").send().await;

        let (model_path, tokenizer_path) = match (model_res, tokenizer_res) {
            (Ok(m), Ok(t)) => (m, t),
            (Err(e), _) | (_, Err(e)) => {
                error!(error = %e, "model download failed");
                return;
            }
        };

        let classifier = match tokio::task::spawn_blocking(move || {
            ToxicClassifier::new(&model_path, &tokenizer_path)
        })
        .await
        {
            Ok(result) => result,
            Err(e) => {
                error!(error = %e, "model load task failed");
                return;
            }
        };

        match classifier {
            Ok(c) => {
                if CLASSIFIER.set(c).is_err() {
                    error!(
                        fault = "classifier already set",
                        "toxic classifier initialized twice"
                    );
                } else {
                    info!("model loaded into memory safely");
                }
            }
            Err(e) => error!(error = %e, "ONNX model init failed"),
        }
    });
}
