use std::sync::Arc;

use anyhow::{Context as _, Result};
use serenity::all::GuildId;
use songbird::Call;
use songbird::Event;
use songbird::TrackEvent;
use songbird::input::{AuxMetadata, Compose, Input, YoutubeDl};
use songbird::tracks::TrackHandle;
use tokio::sync::Mutex;
use tracing::{debug, error};

use crate::features::music::events::TrackEndHandler;
use crate::features::music::state::{MusicState, QueuedTrack};

/// The bits of the app shared by every playback operation.
#[derive(Clone, Copy)]
pub struct PlaybackServices<'a> {
    pub reqwest_client: &'a reqwest::Client,
    pub music_state: &'a MusicState,
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
    requested_by: String,
) -> StartedTrack {
    let src = YoutubeDl::new(services.reqwest_client.clone(), query.clone());
    let source: Input = src.into();

    let handle = {
        let mut handler = call.lock().await;
        handler.play_input(source)
    };
    let handle_uuid = handle.uuid();
    debug!(guild_id = %services.guild_id, uuid = %handle_uuid, "Started playing track input");

    let _ = handle.add_event(
        Event::Track(TrackEvent::End),
        TrackEndHandler {
            guild_id: services.guild_id,
            expected_uuid: handle_uuid,
            call: call.clone(),
            music_state: services.music_state.clone(),
            reqwest_client: services.reqwest_client.clone(),
        },
    );

    let track = QueuedTrack {
        query: metadata.source_url.clone().unwrap_or(query),
        metadata: metadata.clone(),
        requested_by,
    };

    StartedTrack { handle, track, metadata }
}

/// Fetches metadata (unless a cached copy is supplied) then immediately streams the source.
pub async fn prepare_and_play(
    services: PlaybackServices<'_>,
    call: &Arc<Mutex<Call>>,
    query: String,
    requested_by: String,
    cached: Option<AuxMetadata>,
) -> Result<StartedTrack> {
    let metadata = match cached {
        Some(metadata) => metadata,
        None => fetch_metadata(services, &query).await?,
    };
    Ok(start_streaming(services, call, query, metadata, requested_by).await)
}

/// Swaps the active track in guild state, archiving/re-queueing the old one, and
/// returns the previous track handle (if any) so the caller can stop it.
pub async fn install_new_track(
    music_state: &MusicState,
    guild_id: GuildId,
    started: StartedTrack,
    old_disposition: OldTrackDisposition,
) -> Option<TrackHandle> {
    music_state.with_guild(guild_id, |p| {
        if let Some(old_track) = p.current_track.take() {
            match old_disposition {
                OldTrackDisposition::History => p.history.push(old_track),
                OldTrackDisposition::QueueFront => p.queue.push_front(old_track),
            }
        }
        let old_handle = p.current.take();
        p.current = Some(started.handle);
        p.current_track = Some(started.track);
        p.current_meta = Some(started.metadata);
        p.transitioning = false;
        old_handle
    }).await
}