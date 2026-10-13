use super::GuildActor;
use crate::features::music::keys;
use crate::features::music::player::is_live_stream;
use crate::features::music::state::{NowPlayingEvent, NowPlayingResponse};
use anyhow::Result;
use core::time::Duration;
use fred::interfaces::PubsubInterface;
use tokio::time::timeout;
use tracing::warn;

impl GuildActor {
    pub(super) async fn handle_now_playing(&self) -> Option<NowPlayingResponse> {
        let track = self.state.current_track.clone()?;

        let (position_sec, is_paused) = if self.seek_in_flight {
            // While a seek is in flight, report the exact seek target position
            // so WebSocket broadcasts don't leak stale position data!
            (self.last_seek_target_sec, false)
        } else if let Some(handle) = self.state.current.as_ref() {
            match timeout(Duration::from_millis(500), handle.get_info()).await {
                Ok(Ok(info)) => {
                    let is_paused = matches!(info.playing, songbird::tracks::PlayMode::Pause);
                    (info.position.as_secs_f64(), is_paused)
                }
                _ => (self.last_seek_target_sec, false),
            }
        } else {
            (0.0, false)
        };

        Some(NowPlayingResponse {
            track,
            position_sec,
            is_paused,
            is_live: self.state.current_meta.as_ref().is_some_and(is_live_stream),
        })
    }

    pub(super) async fn broadcast_state(&self) {
        let now_playing = self.handle_now_playing().await;
        self.publish_now_playing(now_playing).await;
    }

    /// Broadcasts track state while overriding `position_sec` with the exact seek target,
    /// avoiding Songbird's async `get_info()` race condition.
    pub(super) async fn broadcast_state_with_position(&self, override_pos_sec: f64) {
        let mut now_playing = self.handle_now_playing().await;
        if let Some(ref mut np) = now_playing {
            np.position_sec = override_pos_sec;
        }
        self.publish_now_playing(now_playing).await;
    }

    /// Serializes the current playback state and publishes it to the shared
    /// Redis events channel so every web instance can forward it to clients.
    async fn publish_now_playing(&self, now_playing: Option<NowPlayingResponse>) {
        let event = NowPlayingEvent {
            guild_id: self.guild_id.get(),
            now_playing: serde_json::to_value(now_playing).ok(),
        };

        let payload = match serde_json::to_string(&event) {
            Ok(payload) => payload,
            Err(e) => {
                warn!(
                    guild_id = %self.guild_id,
                    error = %e,
                    "now-playing event serialization failed"
                );
                return;
            }
        };

        let published: Result<i64, _> = self.redis.publish(keys::events_channel(), payload).await;
        if let Err(e) = published {
            warn!(
                guild_id = %self.guild_id,
                error = ?e,
                "now-playing event publish to redis failed"
            );
        }
    }
}
