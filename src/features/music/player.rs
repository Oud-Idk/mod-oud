use anyhow::Result;
use serenity::all::GuildId;
use songbird::input::{AuxMetadata, Compose, Input, YoutubeDl};
use songbird::tracks::TrackHandle;
use songbird::{Call, Event, EventContext, EventHandler as VoiceEventHandler, TrackEvent};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{Mutex, mpsc};
use tracing::{debug, error};
use uuid::Uuid;

use crate::features::music::actor::GuildCommand;
use crate::features::music::state::{GuildPlayer, QueuedTrack};

/// The bits of the app shared by every playback operation.
#[derive(Clone)]
pub struct PlaybackServices<'a> {
    pub reqwest_client: &'a reqwest::Client,
    pub command_tx: mpsc::Sender<GuildCommand>,
    pub guild_id: GuildId,
}

/// What should happen to the previously active track when a new one starts.
#[derive(Clone, Copy)]
pub enum OldTrackDisposition {
    /// Push the finished track onto the play history.
    History,
    /// Put the track back at the front of the queue.
    QueueFront,
}

pub struct StartedTrack {
    pub handle: TrackHandle,
    pub track: QueuedTrack,
    pub metadata: AuxMetadata,
}

/// Lightweight handler that notifies the `GuildActor` when a track ends naturally.
#[derive(Clone)]
pub struct TrackEndHandler {
    pub command_tx: mpsc::Sender<GuildCommand>,
    pub expected_uuid: Uuid,
}

pub enum SeekMode {
    Absolute(Duration),
    RelativeForward(Duration),
    RelativeBackward(Duration),
}

#[serenity::async_trait]
impl VoiceEventHandler for TrackEndHandler {
    async fn act(&self, ctx: &EventContext<'_>) -> Option<Event> {
        if let EventContext::Track(tracks) = ctx {
            for (state, _handle) in *tracks {
                debug!(
                    uuid = %self.expected_uuid,
                    played_secs = state.play_time.as_secs_f64(),
                    "Track end/error event received, notifying GuildActor"
                );
            }
        } else {
            debug!(uuid = %self.expected_uuid, "Track end/error event received, notifying GuildActor");
        }
        let _ = self
            .command_tx
            .send(GuildCommand::TrackEnded {
                uuid: self.expected_uuid,
            })
            .await;
        None
    }
}

/// Fetches track metadata for a URL/query without starting playback.
pub async fn fetch_metadata(services: PlaybackServices<'_>, query: &str) -> Result<AuxMetadata> {
    let mut src = YoutubeDl::new(services.reqwest_client.clone(), query.to_string());
    match src.aux_metadata().await {
        Ok(metadata) => {
            debug!(guild_id = %services.guild_id, title = ?metadata.title, "Aux metadata successfully fetched");
            Ok(metadata)
        }
        Err(e) => {
            error!(guild_id = %services.guild_id, error = ?e, "Error fetching track metadata");
            Err(e.into())
        }
    }
}

/// Starts streaming a source on the given call and installs the end-of-track handler.
pub async fn start_streaming(
    services: PlaybackServices<'_>,
    call: &Arc<Mutex<Call>>,
    query: String,
    metadata: AuxMetadata,
    requested_by: Arc<str>,
    requested_by_id: u64,
) -> StartedTrack {
    use crate::features::music::ffmpeg_live::{FfmpegLiveInput, is_audio_toolchain_available};

    let source: Input = if is_live_stream(&metadata) && is_audio_toolchain_available().await {
        // Live streams (e.g. YouTube) are typically only served as muxed MPEG-TS
        // HLS, which symphonia cannot demux. Decode them to raw PCM via ffmpeg.
        let resolve_query = metadata.source_url.clone().unwrap_or_else(|| query.clone());
        Input::from(FfmpegLiveInput::new(resolve_query))
    } else {
        let src = YoutubeDl::new(services.reqwest_client.clone(), query.clone());
        src.into()
    };

    let handle = {
        let mut handler = call.lock().await;
        handler.play_input(source)
    };
    let handle_uuid = handle.uuid();
    debug!(guild_id = %services.guild_id, uuid = %handle_uuid, "Started playing track input");

    // Install event listeners that notify the Actor when a track finishes.
    // `Error` is registered too: if the input dies mid-stream (e.g. the
    // ffmpeg process behind a live stream exits), the track must be
    // reclaimed/reconnected instead of silently going dead.
    let handler = TrackEndHandler {
        command_tx: services.command_tx.clone(),
        expected_uuid: handle_uuid,
    };
    let _ = handle.add_event(Event::Track(TrackEvent::End), handler.clone());
    let _ = handle.add_event(Event::Track(TrackEvent::Error), handler);

    let track = QueuedTrack {
        query: metadata.source_url.clone().unwrap_or(query),
        metadata: metadata.clone(),
        requested_by,
        requested_by_id,
    };

    StartedTrack {
        handle,
        track,
        metadata,
    }
}

/// Fetches metadata (unless a cached copy is supplied) then immediately streams the source.
pub async fn prepare_and_play(
    services: PlaybackServices<'_>,
    call: &Arc<Mutex<Call>>,
    query: String,
    requested_by: Arc<str>,
    requested_by_id: u64,
    cached: Option<AuxMetadata>,
) -> Result<StartedTrack> {
    let metadata = match cached {
        Some(metadata) => metadata,
        None => fetch_metadata(services.clone(), &query).await?,
    };
    Ok(start_streaming(
        services,
        call,
        query,
        metadata,
        requested_by,
        requested_by_id,
    )
    .await)
}

/// Swaps the active track directly inside the `GuildPlayer` state owned by the actor,
/// archiving/re-queueing the old one, and returning the previous track handle (if any).
pub fn install_new_track(
    player: &mut GuildPlayer,
    started: StartedTrack,
    old_disposition: OldTrackDisposition,
) -> Option<TrackHandle> {
    if let Some(old_track) = player.current_track.take() {
        match old_disposition {
            OldTrackDisposition::History => player.push_history(old_track),
            OldTrackDisposition::QueueFront => player.queue.push_front(old_track),
        }
    }
    let old_handle = player.current.take();
    player.current = Some(started.handle);
    player.current_track = Some(started.track);
    player.current_meta = Some(started.metadata);
    old_handle
}

/// Formats a `Duration` into a human-readable string like `03:45` or `01:15:30`.
pub fn format_duration(duration: Option<Duration>) -> String {
    duration.map_or_else(
        || "Unknown".to_string(),
        |d| {
            let total_secs = d.as_secs();
            let hours = total_secs / 3600;
            let mins = (total_secs % 3600) / 60;
            let secs = total_secs % 60;

            if hours > 0 {
                format!("{hours:02}:{mins:02}:{secs:02}")
            } else {
                format!("{mins:02}:{secs:02}")
            }
        },
    )
}

/// Returns `true` when a track is a live/infinite stream (no finite duration),
/// e.g. a `YouTube` live stream. yt-dlp reports `duration: null` for live sources.
pub fn is_live_stream(metadata: &AuxMetadata) -> bool {
    metadata.duration.is_none_or(|d| d.is_zero())
}

/// Parses a string like "1:30", "01:15:30", or "90" into a `Duration`.
pub fn parse_timestamp(input: &str) -> Option<Duration> {
    let input = input.trim();

    // Raw seconds (e.g. "90")
    if let Ok(secs) = input.parse::<u64>() {
        return Some(Duration::from_secs(secs));
    }

    let parts: Vec<&str> = input.split(':').collect();
    match parts.as_slice() {
        [mins, secs] => {
            let m: u64 = mins.parse().ok()?;
            let s: u64 = secs.parse().ok()?;
            if s >= 60 {
                return None;
            }
            Some(Duration::from_secs(m * 60 + s))
        }
        [hours, mins, secs] => {
            let h: u64 = hours.parse().ok()?;
            let m: u64 = mins.parse().ok()?;
            let s: u64 = secs.parse().ok()?;
            if m >= 60 || s >= 60 {
                return None;
            }
            Some(Duration::from_secs(h * 3600 + m * 60 + s))
        }
        _ => None,
    }
}
