//! The toxicity classifier: a `RoBERTa` tokenizer plus its ONNX graph.

use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, OnceLock};

use anyhow::{anyhow, Context, Result};
use ml_proto::TOXIC_CATEGORIES;
use tokenizers::Tokenizer;
use tract_onnx::prelude::*;

/// Handle to the model shared between the loader task and the gRPC service.
pub type SharedClassifier = Arc<OnceLock<ToxicClassifier>>;

/// A wrapper around the ONNX model and tokenizer for toxicity analysis.
#[derive(Debug)]
pub struct ToxicClassifier {
    tokenizer: Tokenizer,
    model: Arc<TypedRunnableModel>,
    input_count: usize,
    input_ids_slot: usize,
    attention_mask_slot: usize,
}

impl ToxicClassifier {
    /// Loads the ONNX model and tokenizer from disk and initializes the runtime.
    ///
    /// # Errors
    /// Returns an error when the tokenizer or model cannot be loaded.
    pub fn load<P: AsRef<Path>>(model_path: P, tokenizer_path: P) -> Result<Self> {
        let mut tokenizer = Tokenizer::from_file(tokenizer_path)
            .map_err(|e| anyhow!(e))
            .context("failed to load tokenizer")?;
        tokenizer
            .with_truncation(Some(tokenizers::TruncationParams {
                max_length: 512,
                ..Default::default()
            }))
            .map_err(|e| anyhow!(e))
            .context("failed to set truncation")?;

        let model = onnx()
            .model_for_path(model_path)
            .context("failed to load model")?
            .into_optimized()
            .context("failed to optimize model")?;

        let slot = |name: &str| {
            model
                .inputs
                .iter()
                .position(|outlet| model.node(outlet.node).name == name)
                .with_context(|| format!("model has no input named {name}"))
        };
        let input_ids_slot = slot("input_ids")?;
        let attention_mask_slot = slot("attention_mask")?;
        let input_count = model.inputs.len();

        let model = model
            .into_runnable()
            .context("failed to build runnable model")?;

        Ok(Self {
            tokenizer,
            model,
            input_count,
            input_ids_slot,
            attention_mask_slot,
        })
    }

    /// Evaluates the input string and returns a map of toxicity labels to probability scores.
    ///
    /// # Errors
    /// Returns an error when tokenization or inference fails.
    pub fn predict(&self, text: &str) -> Result<HashMap<String, f32>> {
        let encoding = self
            .tokenizer
            .encode(text, true)
            .map_err(|e| anyhow!(e))
            .context("failed to encode token")?;

        let input_ids: Vec<i64> = encoding.get_ids().iter().map(|&id| i64::from(id)).collect();
        let attention_mask: Vec<i64> = encoding
            .get_attention_mask()
            .iter()
            .map(|&m| i64::from(m))
            .collect();
        let len = input_ids.len();

        let shape = (1, len);
        let input_ids = tract_ndarray::Array2::from_shape_vec(shape, input_ids)
            .context("failed to build input tensor")?
            .into_tvalue();
        let attention_mask = tract_ndarray::Array2::from_shape_vec(shape, attention_mask)
            .context("failed to build mask tensor")?
            .into_tvalue();

        // The plan consumes inputs positionally, so place each tensor in the slot
        // the model declared for it.
        let mut slots: Vec<Option<TValue>> = (0..self.input_count).map(|_| None).collect();
        slots[self.input_ids_slot] = Some(input_ids);
        slots[self.attention_mask_slot] = Some(attention_mask);
        let inputs: TVec<TValue> = slots
            .into_iter()
            .map(|slot| slot.context("model input not set"))
            .collect::<Result<_, _>>()?;

        let outputs = self
            .model
            .run(inputs)
            .context("inference failed")?;
        let logits = outputs[0]
            .to_plain_array_view::<f32>()
            .context("failed to read model output")?;

        let mut scores = HashMap::with_capacity(TOXIC_CATEGORIES.len());
        for (label, &logit) in TOXIC_CATEGORIES.iter().zip(&logits) {
            scores.insert((*label).to_string(), 1.0 / (1.0 + (-logit).exp()));
        }

        Ok(scores)
    }
}
