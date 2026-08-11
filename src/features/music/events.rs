use songbird::{Event, EventContext, EventHandler as VoiceEventHandler, TrackEvent};
use songbird::input::{Compose, YoutubeDl};
use serenity::all::GuildId;
use std::sync::Arc;
use songbird::Call;
use tokio::sync::Mutex;
use uuid::Uuid;
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

        let mut src = YoutubeDl::new(self.reqwest_client.clone(), next.query.clone());
        let metadata = match src.aux_metadata().await {
            Ok(m) => m,
            Err(_) => next.metadata.clone(),
        };

        let mut handler = self.call.lock().await;
        let handle = handler.play_input(src.into());
        let handle_uuid = handle.uuid();
        drop(handler);

        let _ = handle.add_event(
            Event::Track(TrackEvent::End),
            TrackEndHandler {
                guild_id: self.guild_id,
                expected_uuid: handle_uuid,
                call: self.call.clone(),
                music_state: self.music_state.clone(),
                reqwest_client: self.reqwest_client.clone(),
            },
        );

        self.music_state.with_guild(self.guild_id, |p| {
            p.current = Some(handle);
            p.current_track = Some(next);
            p.current_meta = Some(metadata);
        }).await;

        None
    }
}