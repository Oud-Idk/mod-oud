//! Dynamic slowmode: raises and lowers channel slowmode in response to how busy a channel is.
//!
//! Policy is guild-level, state is per channel. See `docs/design/dynamic-slowmode.md`.

mod audit;
mod cache;
mod calculation;
mod commands;
mod counter;
mod database;
mod events;
mod jobs;
mod keys;
mod types;
mod web;

pub use commands::slowmode;
pub use counter::record_message;
pub use events::handle_audit_log_entry;
pub use jobs::{SlowmodeWorkerParams, reconcile_armed_channels, start_slowmode_worker};
pub use types::DynamicSlowmodeConfig;
pub use web::routes;
