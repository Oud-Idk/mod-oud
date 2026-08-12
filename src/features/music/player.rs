use std::sync::Arc;
use std::time::Duration;
use anyhow::{Context as _, Result};
use serenity::all::GuildId;
use songbird::input::{AuxMetadata, Compose, Input, YoutubeDl};
use songbird::tracks::TrackHandle;
use songbird::{Call, Event, EventContext, EventHandler as VoiceEventHandler, TrackEvent};
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

/// Lightweight handler that notifies the GuildActor when a track ends naturally.
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
    async fn act(&self, _ctx: &EventContext<'_>) -> Option<Event> {
        debug!(uuid = %self.expected_uuid, "Track ended event received, notifying GuildActor");
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
            Err(e).context("Error fetching track metadata")
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
    let src = YoutubeDl::new(services.reqwest_client.clone(), query.clone());
    let source: Input = src.into();

    let handle = {
        let mut handler = call.lock().await;
        handler.play_input(source)
    };
    let handle_uuid = handle.uuid();
    debug!(guild_id = %services.guild_id, uuid = %handle_uuid, "Started playing track input");

    // Install event listener that sends a command to the Actor when track finishes
    let _ = handle.add_event(
        Event::Track(TrackEvent::End),
        TrackEndHandler {
            command_tx: services.command_tx.clone(),
            expected_uuid: handle_uuid,
        },
    );

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
    Ok(start_streaming(services, call, query, metadata, requested_by, requested_by_id).await)
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
    match duration {
        Some(d) => {
            let total_secs = d.as_secs();
            let hours = total_secs / 3600;
            let mins = (total_secs % 3600) / 60;
            let secs = total_secs % 60;

            if hours > 0 {
                format!("{:02}:{:02}:{:02}", hours, mins, secs)
            } else {
                format!("{:02}:{:02}", mins, secs)
            }
        }
        None => "Unknown".to_string(),
    }
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
            if s >= 60 { return None; }
            Some(Duration::from_secs(m * 60 + s))
        }
        [hours, mins, secs] => {
            let h: u64 = hours.parse().ok()?;
            let m: u64 = mins.parse().ok()?;
            let s: u64 = secs.parse().ok()?;
            if m >= 60 || s >= 60 { return None; }
            Some(Duration::from_secs(h * 3600 + m * 60 + s))
        }
        _ => None,
    }
}