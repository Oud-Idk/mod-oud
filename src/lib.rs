//! Mod Oud: a modular Discord moderation bot.
//!
//! The crate is split into four layers:
//! - [`core`]: bootstrapping glue (config, setup, error types).
//! - [`events`]: raw serenity event dispatch to features.
//! - [`features`]: self-contained features (moderation, leveling, etc.).
//! - [`shared`]: cross-cutting utilities used by three or more features.
//! - [`web`]: the axum HTTP dashboard.

/// Shared compile-time constants.
pub mod constants;
/// Core bootstrapping: configuration, setup, and error types.
pub mod core;
/// Event dispatch from serenity to features.
pub mod events;
/// Self-contained feature modules.
pub mod features;
/// Cross-cutting utilities shared by three or more features.
pub mod shared;
/// The axum HTTP dashboard.
pub mod web;
