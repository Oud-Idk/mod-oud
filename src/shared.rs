//! Cross-cutting utilities shared by three or more features.

/// Guild command context metadata extraction.
pub mod command_context;
/// Embed and message builders.
pub mod embed;
/// Shared error helpers.
pub mod error;
/// Distributed Redis locking.
pub mod locking;
/// Shared message helpers.
pub mod messages;
/// Paginated embed UI.
pub mod pagination;
/// Permission helpers.
pub mod permissions;
/// Placeholder template rendering.
pub mod placeholders;
/// Internal serde helpers.
mod serde_helpers;
/// Username caching and batching.
pub mod username_cache;
/// Voice state caching.
pub mod voice_state;

pub use serde_helpers::{ok_or_none, opt_string_i64, string_i64};
pub use username_cache::{get_username, store_username_relation};