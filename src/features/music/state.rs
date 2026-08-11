use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use serenity::all::GuildId;
use songbird::tracks::TrackHandle;
use tokio::sync::Mutex;
use songbird::input::AuxMetadata;

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
    pub transitioning: bool,
}

#[derive(Clone, Default, Debug)]
pub struct MusicState {
    pub guilds: Arc<Mutex<HashMap<GuildId, GuildPlayer>>>,
}

impl MusicState {
    pub async fn with_guild<F, R>(&self, guild_id: GuildId, f: F) -> R
    where
        F: FnOnce(&mut GuildPlayer) -> R,
    {
        let mut map = self.guilds.lock().await;
        let player = map.entry(guild_id).or_default();
        f(player)
    }
}