//! Core bootstrapping: configuration, database/redis setup, and shared error types.

/// Configuration types and database/redis setup.
pub mod config;
/// Shared error types.
pub mod error;
/// Application setup and wiring.
pub mod setup;
