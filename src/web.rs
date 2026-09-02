//! HTTP dashboard: axum server and route aggregation.

/// Route aggregation.
mod router;
/// Server startup, CORS, and shared state.
pub mod server;

/// Middleware for protecting backend-to-backend routes.
pub mod middleware;

/// Signed ticket verification for real-time endpoints.
pub mod ticket;
