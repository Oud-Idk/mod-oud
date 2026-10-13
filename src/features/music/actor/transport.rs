use super::{GuildActor, Requester};
use crate::features::music::player::OldTrackDisposition;
use crate::features::music::state::StartedTrackInfo;
use crate::features::music::stats::record_track_start;
use anyhow::{Context, Result};
use core::time::Duration;
use serenity::all::ChannelId;
use tokio::time::{Instant, timeout};

impl GuildActor {
    pub(super) async fn handle_restart(&mut self) -> Result<StartedTrackInfo> {
        if let Some(handle) = self.state.current.clone() {
            self.finish_play_stats(&handle);

            if let Ok(Ok(_)) = timeout(
                Duration::from_millis(500),
                handle.seek_async(Duration::ZERO),
            )
            .await
            {
                let _ = handle.play();

                self.last_seek_target_sec = 0.0;
                self.state.current_started_at = Some(Instant::now());
                self.state.current_paused_at = None;
                self.state.current_paused_total = Duration::ZERO;

                if let Some(meta) = self.state.current_meta.as_ref() {
                    let default_req = Requester::default();
                    let req = self
                        .state
                        .current_track
                        .as_ref()
                        .map_or(&default_req, |t| &t.requested_by);
                    record_track_start(&self.stats_tx, self.guild_id, req, handle.uuid(), meta);
                }

                let title = self
                    .state
                    .current_meta
                    .as_ref()
                    .and_then(|m| m.title.clone())
                    .unwrap_or_else(|| "untitled".to_string());
                let thumbnail = self
                    .state
                    .current_meta
                    .as_ref()
                    .and_then(|m| m.thumbnail.clone());

                self.broadcast_state_with_position(0.0).await;

                return Ok(StartedTrackInfo { title, thumbnail });
            }
        }

        // Fallback: Re-prepare and play
        let current_track = self
            .state
            .current_track
            .take()
            .context("Nothing is currently playing.")?;

        self.start_playback(
            None,
            current_track.query,
            &current_track.requested_by,
            Some(current_track.metadata),
            OldTrackDisposition::History,
        )
        .await
    }

    pub(super) async fn handle_skip(&mut self) -> Result<Option<String>> {
        let handle = self
            .state
            .current
            .clone()
            .context("Nothing is currently playing.")?;

        let next_title = self
            .state
            .queue
            .front()
            .and_then(|t| t.metadata.title.clone());

        self.finish_play_stats(&handle);
        let _ = handle.stop();

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
        }

        self.broadcast_state().await;

        Ok(next_title)
    }

    pub(super) async fn handle_prev(
        &mut self,
        vc_channel_id: ChannelId,
    ) -> Result<StartedTrackInfo> {
        let previous = self
            .state
            .history
            .pop()
            .context("No previous track in history.")?;

        let started = self
            .start_playback(
                Some(vc_channel_id),
                previous.query,
                &previous.requested_by,
                Some(previous.metadata),
                OldTrackDisposition::QueueFront,
            )
            .await?;

        self.broadcast_state().await;

        Ok(started)
    }

    pub(super) async fn handle_stop(&mut self) -> Result<()> {
        self.state.queue.clear();

        if let Some(handle) = self.state.current.clone() {
            self.finish_play_stats(&handle);
        }

        if let Some(finished) = self.state.current_track.take() {
            self.state.push_history(finished);
        }

        if let Some(handle) = self.state.current.take() {
            let _ = handle.stop();
        }

        self.state.current_meta = None;

        if self.manager.get(self.guild_id).is_some() {
            let _ = self.manager.remove(self.guild_id).await;
        }

        self.broadcast_state().await;

        Ok(())
    }

    pub(super) async fn handle_pause(&mut self) -> Result<()> {
        let handle = self
            .state
            .current
            .as_ref()
            .context("Nothing is currently playing.")?;

        handle.pause().context("audio stream pause failed")?;

        if self.state.current_paused_at.is_none() {
            self.state.current_paused_at = Some(Instant::now());
        }

        self.broadcast_state().await;
        Ok(())
    }

    pub(super) async fn handle_resume(&mut self) -> Result<()> {
        let handle = self
            .state
            .current
            .as_ref()
            .context("Nothing is currently playing.")?;

        handle.play().context("audio stream resume failed")?;

        if let Some(paused_at) = self.state.current_paused_at.take() {
            self.state.current_paused_total += paused_at.elapsed();
        }

        self.broadcast_state().await;
        Ok(())
    }

    pub(super) async fn handle_go_to_channel(&self, channel_id: ChannelId) -> Result<()> {
        self.manager.join(self.guild_id, channel_id).await?;
        Ok(())
    }
}
