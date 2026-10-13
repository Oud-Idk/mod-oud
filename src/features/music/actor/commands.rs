use crate::features::music::state::{
    NowPlayingResponse, PlayOutcome, QueueAddOutcome, QueueSnapshot, QueuedTrack, StartedTrackInfo,
};
use anyhow::Result;
use core::time::Duration;
use serde::{Deserialize, Serialize};
use serenity::all::{ChannelId, User, UserId};
use std::sync::Arc;
use tokio::sync::oneshot;
use uuid::Uuid;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
/// A generic requester user.
pub struct Requester {
    /// Discord snowflake of the user who initiated the request.
    pub id: UserId,
    /// Display name of the user who initiated the request.
    pub name: Arc<str>,
}

impl From<&User> for Requester {
    fn from(user: &User) -> Self {
        Self {
            id: user.id,
            name: Arc::from(user.name.clone()),
        }
    }
}

impl Default for Requester {
    fn default() -> Self {
        Self {
            id: UserId::default(),
            name: Arc::from(""),
        }
    }
}

pub struct PlayPayload {
    pub query: String,
    pub vc_channel_id: ChannelId,
    pub requested_by: Requester,
    pub respond: oneshot::Sender<Result<PlayOutcome>>,
}

/// Payload containing all necessary parameters to enqueue or start playback of a track/playlist.
pub struct QueueAddPayload {
    /// The search query, direct URL (Spotify, `YouTube`, HTTP stream), or search term to resolve.
    pub query: String,
    /// The voice channel ID that the bot should connect to if it is not currently in a voice channel.
    pub vc_channel_id: ChannelId,
    /// The Discord user who initiated the request.
    pub requested_by: Requester,
    /// Oneshot channel sender used to return the outcome ([`QueueAddOutcome`]) back to the caller.
    pub respond: oneshot::Sender<Result<QueueAddOutcome>>,
}

/// Commands accepted by the guild's dedicated [`GuildActor`](super::GuildActor) message loop.
///
/// Each command communicates asynchronously with the actor and reports results
/// back via an enclosed [`oneshot::Sender`].
pub enum GuildCommand {
    /// Force-starts playback of a track or playlist, stopping whatever is currently playing.
    Play(Box<PlayPayload>),

    /// Smart-enqueues a track or playlist (plays immediately if idle, appends to the queue if active).
    QueueAdd(Box<QueueAddPayload>),

    /// Skips the currently playing track and advances to the next track in the queue.
    Skip {
        /// Channel to return the title of the next track (if any), or an error.
        respond: oneshot::Sender<Result<Option<String>>>,
    },

    /// Pops the last played track from history and plays it immediately.
    Prev {
        /// Voice channel to connect to if disconnected.
        vc_channel_id: ChannelId,
        /// Channel to return metadata about the restarted previous track.
        respond: oneshot::Sender<Result<StartedTrackInfo>>,
    },

    /// Retrieves an immutable snapshot of the current track and upcoming queue.
    QueueList {
        /// Channel to return the current [`QueueSnapshot`].
        respond: oneshot::Sender<Result<QueueSnapshot>>,
    },

    /// Clears all pending tracks from the queue without stopping the current track.
    QueueClear {
        /// Channel to return the number of tracks that were removed.
        respond: oneshot::Sender<Result<usize>>,
    },

    /// Removes a specific track from the queue by its 1-based position.
    QueueRemove {
        /// 1-based index of the track to remove from the queue.
        position: usize,
        /// Channel to return the removed [`QueuedTrack`].
        respond: oneshot::Sender<Result<QueuedTrack>>,
    },

    /// Randomly shuffles the order of all tracks currently in the queue.
    QueueShuffle {
        /// Channel to return the number of shuffled tracks.
        respond: oneshot::Sender<Result<usize>>,
    },

    /// Jumps directly to a specific track in the queue (1-based index), skipping preceding tracks to history.
    QueueJump {
        /// 1-based index of the track in the queue to jump to.
        position: usize,
        /// Channel to return metadata about the newly started track.
        respond: oneshot::Sender<Result<StartedTrackInfo>>,
    },

    /// Retrieves the list of recently played tracks in reverse chronological order.
    HistoryList {
        /// Channel to return the history list.
        respond: oneshot::Sender<Result<Vec<QueuedTrack>>>,
    },

    /// Replays a specific track from the history list by its 1-based index.
    HistoryJump {
        /// 1-based index of the track in the history list (1 being the most recent).
        position: usize,
        /// Channel to return metadata about the newly started track.
        respond: oneshot::Sender<Result<StartedTrackInfo>>,
    },

    /// Retrieves live playback info for the currently playing track (position, pause state, live status).
    NowPlaying {
        /// Channel to return the optional [`NowPlayingResponse`].
        respond: oneshot::Sender<Result<Option<NowPlayingResponse>>>,
    },

    /// Internal event emitted when a track stream ends or disconnects in Songbird.
    TrackEnded {
        /// The unique identifier of the track handle that ended.
        uuid: Uuid,
    },

    /// Restarts the currently playing track from timestamp `0:00`.
    Restart {
        /// Channel to return metadata about the restarted track.
        respond: oneshot::Sender<Result<StartedTrackInfo>>,
    },

    /// Stops playback, clears the entire queue, leaves the voice channel, and cleans up resources.
    Stop {
        /// Channel to return completion confirmation.
        respond: oneshot::Sender<Result<()>>,
    },

    /// Pauses the audio stream of the currently playing track.
    Pause {
        /// Channel to return completion confirmation.
        respond: oneshot::Sender<Result<()>>,
    },

    /// Resumes playback of a paused audio stream.
    Resume {
        /// Channel to return completion confirmation.
        respond: oneshot::Sender<Result<()>>,
    },

    /// Seeks to an absolute timestamp (e.g. `1:30`) or a relative offset (e.g. `+30`, `-15`) within the current track.
    Seek {
        /// String representation of the seek offset or target timestamp.
        input: String,
        /// Channel to return the final calculated [`Duration`] position in the track.
        respond: oneshot::Sender<Result<Duration>>,
    },

    /// Moves the bot to a different voice channel in the guild without interrupting playback.
    GoToChannel {
        /// The target voice channel ID to move to.
        vc_channel_id: ChannelId,
        /// Channel to return completion confirmation.
        respond: oneshot::Sender<Result<()>>,
    },
}
