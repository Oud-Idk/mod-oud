use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, OnceLock};

use crate::features::automod::types::TOXIC_CATEGORIES;
use crate::shared::task;
use hf_hub::HFClient;
use tokenizers::tokenizer::Tokenizer;
use tokio::sync::{mpsc, oneshot};
use tracing::{error, info};
use tract_onnx::prelude::*;

static CLASSIFIER: OnceLock<ToxicClassifier> = OnceLock::new();

/// A wrapper around the ONNX model and tokenizer for toxicity analysis.
#[derive(Debug)]
pub struct ToxicClassifier {
    tokenizer: Tokenizer,
    model: Arc<TypedRunnableModel>,
    input_count: usize,
    input_ids_slot: usize,
    attention_mask_slot: usize,
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

        let model = tract_onnx::onnx()
            .model_for_path(model_path)
            .map_err(|e| anyhow::anyhow!("Failed to load model: {e}"))?
            .into_optimized()
            .map_err(|e| anyhow::anyhow!("Failed to optimize model: {e}"))?;

        let slot = |name: &str| {
            model
                .inputs
                .iter()
                .position(|outlet| model.node(outlet.node).name == name)
                .ok_or_else(|| anyhow::anyhow!("model has no input named {name}"))
        };
        let input_ids_slot = slot("input_ids")?;
        let attention_mask_slot = slot("attention_mask")?;
        let input_count = model.inputs.len();

        let model = model
            .into_runnable()
            .map_err(|e| anyhow::anyhow!("Failed to build runnable model: {e}"))?;

        Ok(Self {
            tokenizer,
            model,
            input_count,
            input_ids_slot,
            attention_mask_slot,
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

        let shape = (1, len);
        let input_ids = tract_ndarray::Array2::from_shape_vec(shape, input_ids)
            .map_err(|e| anyhow::anyhow!("Failed to build input tensor: {e}"))?
            .into_tvalue();
        let attention_mask = tract_ndarray::Array2::from_shape_vec(shape, attention_mask)
            .map_err(|e| anyhow::anyhow!("Failed to build mask tensor: {e}"))?
            .into_tvalue();

        // The plan consumes inputs positionally, so place each tensor in the slot
        // the model declared for it.
        let mut slots: Vec<Option<TValue>> = (0..self.input_count).map(|_| None).collect();
        slots[self.input_ids_slot] = Some(input_ids);
        slots[self.attention_mask_slot] = Some(attention_mask);
        let inputs: TVec<TValue> = slots
            .into_iter()
            .map(|slot| slot.ok_or_else(|| anyhow::anyhow!("model input not set")))
            .collect::<Result<_, _>>()?;

        let outputs = self
            .model
            .run(inputs)
            .map_err(|e| anyhow::anyhow!("Inference failed: {e}"))?;
        let logits = outputs[0]
            .to_plain_array_view::<f32>()
            .map_err(|e| anyhow::anyhow!("Failed to read model output: {e}"))?
            .iter()
            .copied()
            .collect::<Vec<f32>>();

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
        // Drop jobs the caller already gave up on, so a backlog cannot delay fresh ones.
        if job.respond_to.is_closed() {
            continue;
        }

        let Some(c) = CLASSIFIER.get() else {
            error!(
                fault = "classifier not loaded",
                "toxic classifier not yet set up"
            );
            let _ = job.respond_to.send(Err("Model not yet loaded".to_string()));
            continue;
        };

        // RoBERTa inference is CPU-bound: off the async worker, or it stalls the executor.
        let text = job.text;
        let prediction = match tokio::task::spawn_blocking(move || c.predict(&text)).await {
            Ok(result) => result.map_err(|e| e.to_string()),
            Err(e) => {
                error!(error = %e, "toxic classification task failed");
                Err("classification task failed".to_string())
            }
        };
        let _ = job.respond_to.send(prediction);
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

    task::spawn("toxic_classifier_setup", async move {
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
