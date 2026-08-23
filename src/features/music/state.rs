use crate::features::music::actor::GuildActor;
use crate::features::music::actor::GuildCommand;
use crate::features::music::keys;
use crate::features::music::stats::StatsTx;
use crate::shared::spotify_auth::SpotifyAuthCache;
use fred::clients::{Client, SubscriberClient};
use fred::interfaces::{EventInterface, PubsubInterface};
use serde;
use serde::ser::SerializeStruct;
use serde::{Deserialize, Serialize, Serializer};
use serenity::all::GuildId;
use songbird::Songbird;
use songbird::input::AuxMetadata;
use songbird::tracks::TrackHandle;
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::broadcast;
use tokio::sync::{Mutex, mpsc};
use tokio::time::Instant;
use tracing::{error, info, warn};

#[derive(Debug, Serialize)]
pub struct StartedTrackInfo {
    pub title: String,
    pub thumbnail: Option<String>,
}

/// The outcome of an enqueue operation processed by [`GuildCommand::QueueAdd`].
///
/// Differentiates between whether the track started playing immediately (because
/// the bot was idle), was appended to an existing queue, or resulted in a full
/// playlist being enqueued.
pub enum QueueAddOutcome {
    /// The bot was idle, so the track was loaded and started playing immediately.
    Played(StartedTrackInfo),

    /// Music was already playing, so the single track was appended to the back of the queue.
    Queued(StartedTrackInfo),

    /// A playlist was resolved and enqueued (with the first track either started or queued,
    /// and the remaining tracks populated in the queue).
    PlaylistQueued {
        /// Total number of tracks found and queued from the playlist.
        count: usize,
        /// Metadata of the first track in the playlist.
        first_track: StartedTrackInfo,
    },
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

    pub fn push_history_batch(&mut self, tracks: impl IntoIterator<Item = QueuedTrack>) {
        Self::push_history_to(&mut self.history, tracks);
    }

    pub fn push_history_to(
        history: &mut Vec<QueuedTrack>,
        tracks: impl IntoIterator<Item = QueuedTrack>,
    ) {
        history.extend(tracks);
        if history.len() > HISTORY_LIMIT {
            let overflow = history.len() - HISTORY_LIMIT;
            history.drain(0..overflow);
        }
    }
}

/// Global music state shared with the web server: per-guild actors, stats, and
/// the events channel used to push now-playing updates.
#[derive(Clone)]
pub struct MusicState {
    /// Map of guild ID to that guild's music actor channel.
    pub actors: Arc<Mutex<HashMap<GuildId, mpsc::Sender<GuildCommand>>>>,
    /// Channel used to report playback statistics.
    pub stats_tx: StatsTx,
    /// Broadcast channel for now-playing updates (guild ID + pre-rendered JSON),
    /// fed from Redis by [`start_music_event_bridge`].
    pub events_tx: broadcast::Sender<(u64, Option<serde_json::Value>)>,
    /// Redis client actors publish now-playing events through.
    pub redis: Client,
    /// The `YouTube` API key
    pub youtube_api_key: String,
    /// Shared `Spotify` auth cache (global state).
    pub spotify_auth: Arc<SpotifyAuthCache>,
}

impl MusicState {
    /// Creates an empty music state with a fresh events channel.
    #[must_use]
    pub fn new(
        stats_tx: StatsTx,
        youtube_api_key: String,
        spotify_auth: Arc<SpotifyAuthCache>,
        redis: Client,
    ) -> Self {
        let (events_tx, _) = broadcast::channel(256);
        Self {
            actors: Arc::default(),
            stats_tx,
            events_tx,
            redis,
            youtube_api_key,
            spotify_auth,
        }
    }

    /// Returns the actor channel for `guild_id`, spawning a new [`GuildActor`]
    /// if none exists yet.
    pub async fn get_or_spawn_actor(
        &self,
        guild_id: GuildId,
        manager: Arc<Songbird>,
        reqwest_client: reqwest::Client,
    ) -> mpsc::Sender<GuildCommand> {
        let mut map = self.actors.lock().await;

        if let Some(tx) = map.get(&guild_id)
            && !tx.is_closed()
        {
            return tx.clone();
        }

        let tx = GuildActor::spawn(
            guild_id,
            manager,
            reqwest_client,
            self.stats_tx.clone(),
            self.redis.clone(),
            self.youtube_api_key.clone(),
            self.spotify_auth.clone(),
        );
        map.insert(guild_id, tx.clone());
        tx
    }
}

/// Wire format for now-playing updates published on the Redis events channel.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NowPlayingEvent {
    /// The guild whose playback state changed.
    #[serde(rename = "guildId")]
    pub guild_id: u64,
    /// Serialized [`NowPlayingResponse`], or `None` when nothing is playing.
    #[serde(rename = "nowPlaying")]
    pub now_playing: Option<serde_json::Value>,
}

/// Subscribes to Redis now-playing events and forwards them into the local
/// broadcast channel consumed by dashboard WebSocket clients.
///
/// Runs once per process so both bot-only and web-only deployments receive
/// updates regardless of where the music actor lives.
pub fn start_music_event_bridge(
    subscriber: SubscriberClient,
    events_tx: broadcast::Sender<(u64, Option<serde_json::Value>)>,
) {
    let handler_tx = events_tx;

    subscriber.on_message(move |msg| {
        let tx = handler_tx.clone();

        async move {
            if msg.channel != keys::events_channel() {
                return Ok(());
            }

            let payload = match msg.value.convert::<String>() {
                Ok(val) => val,
                Err(e) => {
                    warn!(error = ?e, "Failed to convert now-playing pub/sub payload");
                    return Ok(());
                }
            };

            match serde_json::from_str::<NowPlayingEvent>(&payload) {
                Ok(event) => {
                    let _ = tx.send((event.guild_id, event.now_playing));
                }
                Err(e) => {
                    warn!(error = %e, payload = %payload, "Failed to parse now-playing event");
                }
            }

            Ok(())
        }
    });

    tokio::spawn(async move {
        match subscriber.subscribe(keys::events_channel()).await {
            Ok(()) => info!("Subscribed to music now-playing events"),
            Err(e) => error!(error = ?e, "Failed to subscribe to music now-playing events"),
        }
    });
}

#[derive(Clone, Debug, Serialize)]
pub struct NowPlayingResponse {
    #[serde(flatten)]
    pub track: QueuedTrack,
    pub position_sec: f64,
    pub is_paused: bool,
    pub is_live: bool,
}
