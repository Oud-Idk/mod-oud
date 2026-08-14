//! Music playback, queue management, and WebSocket control.

mod commands;
mod state;
mod player;
mod actor;
mod stats;
mod spotify;
mod youtube;
mod ffmpeg_live;
mod web;
/// Web command bus types used to bridge the web control server and the music actor.
pub mod web_command;

pub use commands::music;
pub use state::MusicState;
pub use stats::start_music_stats_prune_worker;
pub use stats::start_music_stats_worker;
pub use web::routes;
pub use web::start_music_web_control_worker;