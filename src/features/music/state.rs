use crate::features::music::actor::GuildActor;
use crate::features::music::actor::GuildCommand;
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

#[derive(Clone, Debug)]
pub struct QueuedTrack {
    pub query: String,
    pub metadata: AuxMetadata,
    pub requested_by: String,
}

#[derive(Default, Debug)]
pub struct GuildPlayer {
    pub current: Option<TrackHandle>,
    pub current_track: Option<QueuedTrack>,
    pub current_meta: Option<AuxMetadata>,
    pub queue: VecDeque<QueuedTrack>,
    pub history: Vec<QueuedTrack>,
}

#[derive(Clone, Default)]
pub struct MusicState {
    pub actors: Arc<Mutex<HashMap<GuildId, mpsc::Sender<GuildCommand>>>>,
}

impl MusicState {
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

        let tx = GuildActor::spawn(guild_id, manager, reqwest_client);
        map.insert(guild_id, tx.clone());
        tx
    }
}