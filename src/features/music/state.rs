use crate::features::music::actor::GuildActor;
use crate::features::music::actor::GuildCommand;
use crate::features::music::stats::StatsTx;
use serenity::all::GuildId;
use songbird::Songbird;
use songbird::input::AuxMetadata;
use songbird::tracks::TrackHandle;
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use tokio::sync::{Mutex, mpsc};

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

#[derive(Clone, Debug)]
pub struct QueuedTrack {
    pub query: String,
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

#[derive(Clone)]
pub struct MusicState {
    pub actors: Arc<Mutex<HashMap<GuildId, mpsc::Sender<GuildCommand>>>>,
    pub stats_tx: StatsTx,
}

impl MusicState {
    pub fn new(stats_tx: StatsTx) -> Self {
        Self {
            actors: Arc::default(),
            stats_tx,
        }
    }

    /// Gets the actor sender for a guild, spawning a new `GuildActor` task if one isn't running.
    pub async fn get_or_spawn_actor(
        &self,
        guild_id: GuildId,
        manager: Arc<Songbird>,
        reqwest_client: reqwest::Client,
    ) -> mpsc::Sender<GuildCommand> {
        let mut map = self.actors.lock().await;

        if let Some(tx) = map.get(&guild_id) {
            if !tx.is_closed() {
                return tx.clone();
            }
        }

        let tx = GuildActor::spawn(
            guild_id,
            manager,
            reqwest_client,
            self.stats_tx.clone(),
        );
        map.insert(guild_id, tx.clone());
        tx
    }
}