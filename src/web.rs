//! HTTP dashboard: axum server and route aggregation.

/// Server startup, CORS, and shared state.
pub mod server;
/// Route aggregation.
mod router;