use songbird::{Event, EventContext, EventHandler as VoiceEventHandler};
use serenity::all::GuildId;
use std::sync::Arc;
use songbird::Call;
use tokio::sync::Mutex;
use tracing::error;
use uuid::Uuid;
use crate::features::music::player::PlaybackServices;
use crate::features::music::state::MusicState;

pub struct TrackEndHandler {
    pub guild_id: GuildId,
    pub expected_uuid: Uuid,
    pub call: Arc<Mutex<Call>>,
    pub music_state: MusicState,
    pub reqwest_client: reqwest::Client,
}

#[serenity::async_trait]
impl VoiceEventHandler for TrackEndHandler {
    async fn act(&self, _ctx: &EventContext<'_>) -> Option<Event> {
        let next = self.music_state.with_guild(self.guild_id, |p| {
            let still_current = p.current.as_ref().map(|h| h.uuid()) == Some(self.expected_uuid);
            if !still_current {
                return None;
            }
            // Push finished track to history
            if let Some(finished_track) = p.current_track.take() {
                p.history.push(finished_track);
            }
            p.current = None;
            p.current_meta = None;
            p.queue.pop_front()
        }).await;

        let Some(next) = next else { return None };

        let services = PlaybackServices {
            reqwest_client: &self.reqwest_client,
            music_state: &self.music_state,
            guild_id: self.guild_id,
        };
        let started = match crate::features::music::player::prepare_and_play(
            services,
            &self.call,
            next.query.clone(),
            next.requested_by.clone(),
            Some(next.metadata.clone()),
        ).await {
            Ok(started) => started,
            Err(e) => {
                error!(guild_id = %self.guild_id, error = ?e, "Failed to autoplay next queued track");
                return None;
            }
        };

        self.music_state.with_guild(self.guild_id, |p| {
            p.current = Some(started.handle);
            p.current_track = Some(started.track);
            p.current_meta = Some(started.metadata);
        }).await;

        None
    }
}