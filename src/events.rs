//! Event dispatch: raw serenity events are fanned out to features.

/// Component interaction handling.
pub mod interact;
/// The main event dispatcher.
pub mod dispatch;