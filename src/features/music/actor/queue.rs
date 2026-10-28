use super::GuildActor;
use crate::features::music::player::OldTrackDisposition;
use crate::features::music::state::{GuildPlayer, QueueSnapshot, QueuedTrack, StartedTrackInfo};
use anyhow::{Context, Result, bail};
use rand::seq::SliceRandom;

impl GuildActor {
    pub(super) fn handle_queue_list(&self) -> QueueSnapshot {
        QueueSnapshot {
            current_meta: self.state.current_meta.clone(),
            queue: self.state.queue.iter().cloned().collect(),
        }
    }

    pub(super) fn handle_queue_clear(&mut self) -> usize {
        let len = self.state.queue.len();
        self.state.queue.clear();
        len
    }

    pub(super) fn handle_queue_remove(&mut self, position: usize) -> Result<QueuedTrack> {
        if position == 0 {
            bail!("Position must be 1 or greater.");
        }
        self.state
            .queue
            .remove(position - 1)
            .context("Position out of bounds. No such track in the queue.")
    }

    pub(super) fn handle_queue_shuffle(&mut self) -> usize {
        let count = self.state.queue.len();
        self.state.queue.make_contiguous().shuffle(&mut rand::rng());
        count
    }

    pub(super) async fn handle_queue_jump(&mut self, position: usize) -> Result<StartedTrackInfo> {
        if position == 0 {
            bail!("Position must be 1 or greater.");
        }
        if position > self.state.queue.len() {
            bail!("Position out of bounds. No such track in the queue.");
        }

        let target_index = position - 1;

        let target = self
            .state
            .queue
            .remove(target_index)
            .context("No track found.")?;

        GuildPlayer::push_history_to(
            &mut self.state.history,
            self.state.queue.drain(..target_index),
        );

        let title = target
            .metadata
            .title
            .as_deref()
            .unwrap_or("untitled")
            .to_string();
        let thumbnail = target.metadata.thumbnail.clone();

        self.start_playback(
            None,
            target.query,
            &target.requested_by,
            Some(target.metadata),
            OldTrackDisposition::History,
        )
        .await?;

        Ok(StartedTrackInfo { title, thumbnail })
    }

    pub(super) fn handle_history_list(&self) -> Vec<QueuedTrack> {
        self.state.history.iter().rev().cloned().collect()
    }

    pub(super) async fn handle_history_jump(
        &mut self,
        position: usize,
    ) -> Result<StartedTrackInfo> {
        if position == 0 {
            bail!("Position must be 1 or greater.");
        }
        let len = self.state.history.len();
        let target = self
            .state
            .history
            .get(len - position)
            .cloned()
            .context("Position out of bounds. No such track in the history.")?;

        let title = target
            .metadata
            .title
            .as_deref()
            .unwrap_or("untitled")
            .to_string();
        let thumbnail = target.metadata.thumbnail.clone();

        self.start_playback(
            None,
            target.query,
            &target.requested_by,
            Some(target.metadata),
            OldTrackDisposition::History,
        )
        .await?;

        Ok(StartedTrackInfo { title, thumbnail })
    }
}
