use super::resolve::build_query_url;
use super::GuildActor;
use crate::features::music::player::{OldTrackDisposition, is_live_stream, prepare_and_play};
use crate::features::music::stats::record_track_end;
use core::time::Duration;
use songbird::tracks::TrackHandle;
use tokio::time::{Instant, timeout};
use tracing::warn;
use uuid::Uuid;

impl GuildActor {
    pub(super) async fn handle_track_ended(&mut self, uuid: Uuid) {
        if self
            .state
            .current
            .as_ref()
            .map(songbird::tracks::TrackHandle::uuid)
            != Some(uuid)
        {
            return;
        }

        // Live streams never end naturally: a TrackEnd event here means the
        // streaming source dropped (finite HLS segment chunk exhausted or URL
        // expired), not that the "track" finished. Reconnect instead of
        // treating it like a completed song.
        if self.state.current_meta.as_ref().is_some_and(is_live_stream)
            && self.reconnect_live_stream().await
        {
            return;
        }

        let fallback_duration = self.state.current_meta.as_ref().and_then(|m| m.duration);

        let wall_clock_elapsed_sec =
            if let Some(started_at) = self.state.current_started_at.as_ref() {
                let total_elapsed = started_at.elapsed();
                let mut paused_time = self.state.current_paused_total;
                if let Some(paused_at) = self.state.current_paused_at.as_ref() {
                    paused_time += paused_at.elapsed();
                }
                total_elapsed.saturating_sub(paused_time).as_secs_f64()
            } else {
                0.0
            };

        // Estimated position where the track actually stopped
        let estimated_end_pos_sec = self.last_seek_target_sec + wall_clock_elapsed_sec;
        let total_duration_sec = fallback_duration.map_or(0.0, |d| d.as_secs_f64());

        // A drop ONLY occurs if the track stopped far away from its expected end (< total_duration - 5s)
        let is_premature_drop = total_duration_sec > 15.0
            && estimated_end_pos_sec < (total_duration_sec - 5.0)
            && self.retry_count < 3;

        if is_premature_drop {
            self.retry_count += 1;
            let resume_at = Duration::from_secs_f64(estimated_end_pos_sec.max(0.0));

            if let Some(current_track) = self.state.current_track.clone() {
                let fresh_query_url = build_query_url(
                    &self.reqwest_client,
                    &self.spotify_auth,
                    &current_track.query,
                    &self.youtube_api_key,
                )
                .await;

                let info = self
                    .start_playback(
                        None,
                        fresh_query_url, // Pass freshly resolved URL
                        &current_track.requested_by,
                        Some(current_track.metadata),
                        OldTrackDisposition::History,
                    )
                    .await;

                if let (Ok(_), Some(handle)) = (&info, self.state.current.clone())
                    && resume_at > Duration::ZERO
                {
                    let _ = timeout(Duration::from_secs(4), handle.seek_async(resume_at)).await;
                    self.last_seek_target_sec = resume_at.as_secs_f64();
                    self.state.current_started_at = Some(Instant::now());
                }
                return;
            }
        }

        self.retry_count = 0;

        if let Some(handle) = self.state.current.clone() {
            self.finish_play_stats(&handle);
        }

        if let Some(finished) = self.state.current_track.take() {
            self.state.push_history(finished);
        }
        self.state.current = None;
        self.state.current_meta = None;

        if let Some(next) = self.state.queue.pop_front() {
            let _ = self
                .start_playback(
                    None,
                    next.query,
                    &next.requested_by,
                    None,
                    OldTrackDisposition::History,
                )
                .await;
        } else {
            self.broadcast_state().await;
        }
    }

    /// Reconnects a live stream whose streaming source dropped (e.g. the finite
    /// HLS segment chunk yt-dlp handed out was exhausted). Keeps the same track
    /// active instead of letting the drop be treated as a natural track end.
    pub(super) async fn reconnect_live_stream(&mut self) -> bool {
        // Safety valve: if the source keeps dropping faster than this, treat it
        // as genuinely dead and let the queue advance instead of reconnect-spamming.
        const MIN_RECONNECT_INTERVAL: Duration = Duration::from_secs(5);
        if let Some(last) = self.last_live_reconnect_at
            && last.elapsed() < MIN_RECONNECT_INTERVAL
        {
            warn!(guild_id = %self.guild_id, "live stream dropped again too quickly; advancing the queue");
            return false;
        }

        let Some(current_track) = self.state.current_track.clone() else {
            return false;
        };

        // Give the stream endpoint a moment to settle before reconnecting.
        tokio::time::sleep(Duration::from_secs(1)).await;

        let Some(call) = self.manager.get(self.guild_id) else {
            return false;
        };

        if let Some(handle) = self.state.current.take() {
            self.finish_play_stats(&handle);
            let _ = handle.stop();
        }

        let fresh_query_url = build_query_url(
            &self.reqwest_client,
            &self.spotify_auth,
            &current_track.query,
            &self.youtube_api_key,
        )
        .await;

        match prepare_and_play(
            self.services(),
            &call,
            fresh_query_url,
            &current_track.requested_by,
            Some(current_track.metadata),
        )
        .await
        {
            Ok(started) => {
                self.last_live_reconnect_at = Some(Instant::now());
                self.state.current = Some(started.handle);
                self.state.current_meta = Some(started.metadata);
                self.last_seek_target_sec = 0.0;
                self.state.current_started_at = Some(Instant::now());
                self.state.current_paused_at = None;
                self.state.current_paused_total = Duration::ZERO;
                self.broadcast_state().await;
                true
            }
            Err(e) => {
                warn!(error = ?e, guild_id = %self.guild_id, "live stream reconnect failed");
                self.broadcast_state().await;
                false
            }
        }
    }

    /// Non-blocking: enqueues the "ended" event for the current play, backfilled
    /// against the matching `handle_uuid` by the stats worker.
    pub(super) fn finish_play_stats(&mut self, handle: &TrackHandle) {
        let fallback_duration = self.state.current_meta.as_ref().and_then(|m| m.duration);

        // Calculate actual active wall-clock listened time for this segment
        let active_listened = if let Some(started_at) = self.state.current_started_at.take() {
            let total_elapsed = started_at.elapsed();
            let mut paused_time = self.state.current_paused_total;
            if let Some(paused_at) = self.state.current_paused_at.take() {
                paused_time += paused_at.elapsed();
            }
            total_elapsed.saturating_sub(paused_time)
        } else {
            Duration::ZERO
        };

        let mut listened_ms = i64::try_from(active_listened.as_millis()).unwrap_or(i64::MAX);

        if let Some(total_dur) = fallback_duration {
            let max_ms = i64::try_from(total_dur.as_millis()).unwrap_or(i64::MAX);
            if listened_ms > max_ms {
                listened_ms = max_ms;
            }
        }

        record_track_end(&self.stats_tx, handle.uuid(), listened_ms);

        self.state.current_paused_total = Duration::ZERO;
    }
}
