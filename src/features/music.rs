//! Music playback, queue management, and WebSocket control.

mod actor;
mod commands;
mod ffmpeg_live;
mod player;
mod spotify;
mod state;
mod stats;
mod web;
/// Web command bus types used to bridge the web control server and the music actor.
mod web_command;
mod youtube;

pub use commands::music;

pub use stats::start_music_stats_prune_worker;
pub use stats::start_music_stats_worker;

pub use web::routes;
pub use web::start_music_web_control_worker;

pub use actor::{GuildCommand, QueueAddPayload};
pub use state::{QueueAddOutcome, MusicState};
pub use web_command::{WebCommand, WebCommandBus};