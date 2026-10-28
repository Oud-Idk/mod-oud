//! Wire contract shared by the bot and the ML inference service.

/// Category labels the toxicity model scores, in model output order.
///
/// The bot orders its threshold checks by this list and the service maps logits
/// by the same list, so the two cannot drift.
pub const TOXIC_CATEGORIES: [&str; 7] = [
    "toxicity",
    "severe_toxicity",
    "obscene",
    "identity_attack",
    "insult",
    "threat",
    "sexual_explicit",
];

/// Generated messages and gRPC stubs for `mod_oud.ml.toxicity.v1`.
#[allow(clippy::all, clippy::pedantic, clippy::nursery, missing_docs)]
pub mod toxicity {
    tonic::include_proto!("mod_oud.ml.toxicity.v1");
}
