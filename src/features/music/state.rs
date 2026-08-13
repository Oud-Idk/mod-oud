use crate::features::music::actor::GuildActor;
use crate::features::music::actor::GuildCommand;
use crate::features::music::stats::StatsTx;
use serenity::all::GuildId;
use songbird::Songbird;
use songbird::input::AuxMetadata;
use songbird::tracks::TrackHandle;
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use std::time::Duration;
use serde;
use serde::{Serialize, Serializer};
use serde::ser::SerializeStruct;
use tokio::sync::{Mutex, mpsc};

#[derive(Debug, Serialize)]
pub struct StartedTrackInfo {
    pub title: String,
    pub thumbnail: Option<String>,
}

pub enum QueueAddOutcome {
    Played(StartedTrackInfo),
    Queued(StartedTrackInfo),
    PlaylistQueued { count: usize, first_track: StartedTrackInfo },
}

pub enum PlayOutcome {
    Single(StartedTrackInfo),
    Playlist {
        first_track: StartedTrackInfo,
        count: usize,
    },
}

#[derive(Clone)]
pub struct QueueSnapshot {
    pub current_meta: Option<AuxMetadata>,
    pub queue: Vec<QueuedTrack>,
}

fn serialize_aux_metadata<S>(metadata: &AuxMetadata, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    let mut state = serializer.serialize_struct("AuxMetadata", 5)?;
    state.serialize_field("title", &metadata.title)?;
    state.serialize_field("artist", &metadata.artist)?;
    state.serialize_field("duration", &metadata.duration.map(|d| d.as_secs()))?;
    state.serialize_field("thumbnail", &metadata.thumbnail)?;
    state.serialize_field("source_url", &metadata.source_url)?;
    state.end()
}


#[derive(Clone, Debug, Serialize)]
pub struct QueuedTrack {
    pub query: String,
    #[serde(serialize_with = "serialize_aux_metadata")]
    pub metadata: AuxMetadata,
    pub requested_by: Arc<str>,
    pub requested_by_id: u64,
}

#[derive(Default, Debug)]
pub struct GuildPlayer {
    pub current: Option<TrackHandle>,
    pub current_track: Option<QueuedTrack>,
    pub current_meta: Option<AuxMetadata>,
    pub queue: VecDeque<QueuedTrack>,
    pub history: Vec<QueuedTrack>,

    pub current_started_at: Option<Instant>,
    pub current_paused_at: Option<Instant>,
    pub current_paused_total: Duration,
}

const HISTORY_LIMIT: usize = 50;

impl GuildPlayer {
    /// Appends a single track to play history.
    pub fn push_history(&mut self, track: QueuedTrack) {
        self.push_history_batch(std::iter::once(track));
    }

    pub fn push_history_batch(&mut self, tracks: impl IntoIterator<Item=QueuedTrack>) {
        Self::push_history_to(&mut self.history, tracks);
    }

    pub fn push_history_to(history: &mut Vec<QueuedTrack>, tracks: impl IntoIterator<Item=QueuedTrack>) {
        history.extend(tracks);
        if history.len() > HISTORY_LIMIT {
            let overflow = history.len() - HISTORY_LIMIT;
            history.drain(0..overflow);
        }
    }
}

use tokio::sync::broadcast;
use tokio::time::Instant;

#[derive(Clone)]
pub struct MusicState {
    pub actors: Arc<Mutex<HashMap<GuildId, mpsc::Sender<GuildCommand>>>>,
    pub stats_tx: StatsTx,
    pub events_tx: broadcast::Sender<(u64, Option<NowPlayingResponse>)>,
}

impl MusicState {
    #[must_use]
    pub fn new(stats_tx: StatsTx) -> Self {
        let (events_tx, _) = broadcast::channel(256);
        Self {
            actors: Arc::default(),
            stats_tx,
            events_tx,
        }
    }

    pub async fn get_or_spawn_actor(
        &self,
        guild_id: GuildId,
        manager: Arc<Songbird>,
        reqwest_client: reqwest::Client,
    ) -> mpsc::Sender<GuildCommand> {
        let mut map = self.actors.lock().await;

        if let Some(tx) = map.get(&guild_id)
            && !tx.is_closed() {
                return tx.clone();
            }

        let tx = GuildActor::spawn(
            guild_id,
            manager,
            reqwest_client,
            self.stats_tx.clone(),
            self.events_tx.clone(), // Pass events channel to the actor
        );
        map.insert(guild_id, tx.clone());
        tx
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct NowPlayingResponse {
    #[serde(flatten)]
    pub track: QueuedTrack,
    pub position_sec: f64,
    pub is_paused: bool,
    pub is_live: bool,
}