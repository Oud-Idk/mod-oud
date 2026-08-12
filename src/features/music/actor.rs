use crate::features::music::player::{
    fetch_metadata, format_duration, install_new_track, parse_timestamp, prepare_and_play,
    OldTrackDisposition, PlaybackServices, SeekMode,
};
use crate::features::music::spotify::{resolve_spotify_playlist, resolve_spotify_track};
// 1. IMPORT YOUR NEW YOUTUBE FUNCTIONS HERE:
use crate::features::music::youtube::{resolve_youtube_playlist, resolve_youtube_video};

use crate::features::music::state::{
    GuildPlayer, PlayOutcome, QueueAddOutcome, QueueSnapshot, QueuedTrack, StartedTrackInfo,
};
use anyhow::{bail, Context, Result};
use core::time::Duration;
use rand::seq::SliceRandom;
use serde_json::Value;
use serenity::all::{ChannelId, GuildId, User};
use songbird::input::AuxMetadata;
use songbird::Songbird;
use std::sync::Arc;
use std::vec::IntoIter;
use tokio::sync::{mpsc, oneshot};
use tracing::{debug, warn};
use uuid::Uuid;

pub struct GuildActor {
    pub guild_id: GuildId,
    pub manager: Arc<Songbird>,
    pub reqwest_client: reqwest::Client,
    pub command_rx: mpsc::Receiver<GuildCommand>,
    pub command_tx: mpsc::Sender<GuildCommand>,
    pub state: GuildPlayer,
}

/// Resolves single queries (Spotify URLs, YouTube video URLs, or plain text searches).
async fn build_query_url(client: &reqwest::Client, query: &str) -> String {
    debug!(query = %query, "Resolving query URL");

    // Try resolving Spotify track into ytsearch string
    if let Some(spotify_query) = resolve_spotify_track(client, query).await {
        return spotify_query;
    }

    // Try resolving YouTube video/shorts/youtu.be link into a clean watch URL
    if let Some(youtube_query) = resolve_youtube_video(client, query).await {
        return youtube_query;
    }

    if query.starts_with("http://") || query.starts_with("https://") {
        debug!(query = %query, "Query detected as direct URL");
        query.to_string()
    } else {
        let search_query = format!("ytsearch:{}", query);
        debug!(query = %query, search_query = %search_query, "Constructed ytsearch query");
        search_query
    }
}

/// Helper method to try resolving either Spotify or YouTube playlists into track search terms/URLs.
async fn resolve_any_playlist(client: &reqwest::Client, query: &str) -> Option<Vec<String>> {
    if let Some(spotify_tracks) = resolve_spotify_playlist(client, query).await {
        return Some(spotify_tracks);
    }

    if let Some(youtube_tracks) = resolve_youtube_playlist(client, query).await {
        return Some(youtube_tracks);
    }

    None
}

/// Parses seek inputs with relative signs like "+30", "-15", or absolute "1:30".
fn parse_seek_input(input: &str) -> Option<SeekMode> {
    let trimmed = input.trim();
    if let Some(rest) = trimmed.strip_prefix('+') {
        let dur = parse_timestamp(rest)?;
        Some(SeekMode::RelativeForward(dur))
    } else if let Some(rest) = trimmed.strip_prefix('-') {
        let dur = parse_timestamp(rest)?;
        Some(SeekMode::RelativeBackward(dur))
    } else {
        let dur = parse_timestamp(trimmed)?;
        Some(SeekMode::Absolute(dur))
    }
}

pub enum GuildCommand {
    Play {
        query: String,
        vc_channel_id: ChannelId,
        requested_by: User,
        respond: oneshot::Sender<Result<PlayOutcome>>,
    },
    Skip {
        respond: oneshot::Sender<Result<Option<String>>>,
    },
    Prev {
        vc_channel_id: ChannelId,
        respond: oneshot::Sender<Result<StartedTrackInfo>>,
    },
    QueueAdd {
        query: String,
        vc_channel_id: ChannelId,
        requested_by: User,
        respond: oneshot::Sender<Result<QueueAddOutcome>>,
    },
    QueueList {
        respond: oneshot::Sender<Result<QueueSnapshot>>,
    },
    QueueClear {
        respond: oneshot::Sender<Result<usize>>,
    },
    QueueRemove {
        position: usize,
        respond: oneshot::Sender<Result<QueuedTrack>>,
    },
    QueueShuffle {
        respond: oneshot::Sender<Result<usize>>,
    },
    QueueJump {
        position: usize,
        respond: oneshot::Sender<Result<StartedTrackInfo>>,
    },
    HistoryList {
        respond: oneshot::Sender<Result<Vec<QueuedTrack>>>,
    },
    HistoryJump {
        position: usize,
        respond: oneshot::Sender<Result<StartedTrackInfo>>,
    },
    NowPlaying {
        respond: oneshot::Sender<Result<Option<QueuedTrack>>>,
    },
    TrackEnded {
        uuid: Uuid,
    },
    Restart {
        respond: oneshot::Sender<Result<StartedTrackInfo>>,
    },
    Stop {
        respond: oneshot::Sender<Result<()>>,
    },
    Pause {
        respond: oneshot::Sender<Result<()>>,
    },
    Resume {
        respond: oneshot::Sender<Result<()>>,
    },
    Seek {
        input: String,
        respond: oneshot::Sender<Result<Duration>>,
    },
}

impl GuildActor {
    pub fn new(
        guild_id: GuildId,
        manager: Arc<Songbird>,
        reqwest_client: reqwest::Client,
        command_tx: mpsc::Sender<GuildCommand>,
        command_rx: mpsc::Receiver<GuildCommand>,
    ) -> Self {
        Self {
            guild_id,
            manager,
            reqwest_client,
            command_tx,
            command_rx,
            state: GuildPlayer::default(),
        }
    }

    pub fn spawn(
        guild_id: GuildId,
        manager: Arc<Songbird>,
        reqwest_client: reqwest::Client,
    ) -> mpsc::Sender<GuildCommand> {
        let (tx, rx) = mpsc::channel(32);
        let actor = Self::new(guild_id, manager, reqwest_client, tx.clone(), rx);

        tokio::spawn(async move {
            actor.run().await;
        });

        tx
    }

    fn services(&self) -> PlaybackServices<'_> {
        PlaybackServices {
            reqwest_client: &self.reqwest_client,
            command_tx: self.command_tx.clone(),
            guild_id: self.guild_id,
        }
    }

    async fn handle_play(
        &mut self,
        query: String,
        vc_channel_id: ChannelId,
        requested_by: User,
    ) -> Result<PlayOutcome> {
        let call = match self.manager.get(self.guild_id) {
            Some(call) => call,
            None => self.manager.join(self.guild_id, vc_channel_id).await?,
        };

        let requester: Arc<str> = Arc::from(requested_by.name.as_str());

        if let Some(search_terms) = resolve_any_playlist(&self.reqwest_client, &query).await {
            let total_tracks = search_terms.len();
            if total_tracks == 0 {
                bail!("Playlist appears to be empty!");
            }

            let mut terms_iter = search_terms.into_iter();
            let first_term = terms_iter.next().context("Playlist was empty!")?;

            // Eagerly fetch YouTube metadata for Track #1 and start playing immediately
            let started = prepare_and_play(
                self.services(),
                &call,
                first_term,
                requester.clone(),
                None,
            )
                .await?;

            let title = started.metadata.title.as_deref().unwrap_or("untitled").to_string();
            let thumbnail = started.metadata.thumbnail.clone();

            // Archive the currently playing track into history
            if let Some(old_track) = self.state.current_track.take() {
                self.state.push_history(old_track);
            }

            // Stop current playback handle and swap to new track
            let old_handle = self.state.current.take();
            self.state.current = Some(started.handle);
            self.state.current_track = Some(started.track);
            self.state.current_meta = Some(started.metadata);

            if let Some(old_handle) = old_handle {
                let _ = old_handle.stop();
            }

            self.populate_queue(&requester, &mut terms_iter);

            return Ok(PlayOutcome::Playlist {
                first_track: StartedTrackInfo { title, thumbnail },
                count: total_tracks,
            });
        }

        let query_url = build_query_url(&self.reqwest_client, &query).await;

        let started = prepare_and_play(
            self.services(),
            &call,
            query_url,
            requester.clone(),
            None,
        )
            .await?;

        let title = started.metadata.title.as_deref().unwrap_or("untitled").to_string();
        let thumbnail = started.metadata.thumbnail.clone();

        if let Some(old_track) = self.state.current_track.take() {
            self.state.push_history(old_track);
        }

        let old_handle = self.state.current.take();
        self.state.current = Some(started.handle);
        self.state.current_track = Some(started.track);
        self.state.current_meta = Some(started.metadata);

        if let Some(old_handle) = old_handle {
            let _ = old_handle.stop();
        }

        Ok(PlayOutcome::Single(StartedTrackInfo { title, thumbnail }))
    }

    async fn handle_queue_add(
        &mut self,
        query: String,
        vc_channel_id: ChannelId,
        requested_by: User,
    ) -> Result<QueueAddOutcome> {
        let requester: Arc<str> = Arc::from(requested_by.name.as_str());

        if let Some(search_terms) = resolve_any_playlist(&self.reqwest_client, &query).await {
            let total_tracks = search_terms.len();
            if total_tracks == 0 {
                bail!("Playlist appears to be empty!");
            }

            let mut terms_iter = search_terms.into_iter();
            let first_term = terms_iter.next().context("Playlist was empty!")?;

            let mut first_meta = fetch_metadata(self.services(), &first_term).await?;
            let title = first_meta.title.as_deref().unwrap_or("untitled").to_string();
            let thumbnail = first_meta.thumbnail.clone();

            let first_queued = QueuedTrack {
                query: first_meta.source_url.take().unwrap_or(first_term),
                metadata: first_meta.clone(),
                requested_by: requester.clone(),
            };

            let first_track_info = StartedTrackInfo { title, thumbnail };

            if self.state.current.is_none() {
                // Play song #1 immediately!
                self.start_playback(
                    Some(vc_channel_id),
                    first_queued.query,
                    first_queued.requested_by,
                    Some(first_queued.metadata),
                    OldTrackDisposition::History,
                )
                    .await?;
            } else {
                // If something is already playing, push song #1 to queue
                self.state.queue.push_back(first_queued);
            }

            self.populate_queue(&requester, &mut terms_iter);

            return Ok(QueueAddOutcome::PlaylistQueued {
                count: total_tracks,
                first_track: first_track_info,
            });
        }

        let query_url = build_query_url(&self.reqwest_client, &query).await;
        let mut metadata = fetch_metadata(self.services(), &query_url).await?;

        let title = metadata.title.as_deref().unwrap_or("untitled").to_string();
        let thumbnail = metadata.thumbnail.clone();
        let queued = QueuedTrack {
            query: metadata.source_url.take().unwrap_or(query_url),
            metadata,
            requested_by: requester.clone(),
        };

        if self.state.current.is_some() {
            self.state.queue.push_back(queued);
            Ok(QueueAddOutcome::Queued(StartedTrackInfo { title, thumbnail }))
        } else {
            let _ = self
                .start_playback(
                    Some(vc_channel_id),
                    queued.query,
                    queued.requested_by,
                    Some(queued.metadata),
                    OldTrackDisposition::History,
                )
                .await?;
            Ok(QueueAddOutcome::Played(StartedTrackInfo { title, thumbnail }))
        }
    }

    fn populate_queue(&mut self, requested_by: &Arc<str>, terms_iter: &mut IntoIter<String>) {
        for search_term in terms_iter {
            let display_title = search_term.strip_prefix("ytsearch:").unwrap_or(&search_term).to_string();
            let mut placeholder_meta = AuxMetadata::default();
            placeholder_meta.title = Some(display_title);

            self.state.queue.push_back(QueuedTrack {
                query: search_term,
                metadata: placeholder_meta,
                requested_by: requested_by.clone(),
            });
        }
    }

    async fn handle_restart(&mut self) -> Result<StartedTrackInfo> {
        let current_track = self
            .state
            .current_track
            .take()
            .context("Nothing is currently playing.")?;

        self.start_playback(
            None,
            current_track.query,
            current_track.requested_by,
            Some(current_track.metadata),
            OldTrackDisposition::History,
        )
            .await
    }

    async fn handle_skip(&mut self) -> Result<Option<String>> {
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
                    next.requested_by,
                    None,
                    OldTrackDisposition::History,
                )
                .await;
        }

        Ok(next_title)
    }

    async fn handle_prev(&mut self, vc_channel_id: ChannelId) -> Result<StartedTrackInfo> {
        let previous = self.state.history.pop().context("No previous track in history.")?;

        self.start_playback(
            Some(vc_channel_id),
            previous.query,
            previous.requested_by,
            Some(previous.metadata),
            OldTrackDisposition::QueueFront,
        )
            .await
    }

    fn handle_queue_list(&self) -> QueueSnapshot {
        QueueSnapshot {
            current_meta: self.state.current_meta.clone(),
            queue: self.state.queue.iter().cloned().collect(),
        }
    }

    async fn handle_queue_clear(&mut self) -> usize {
        let len = self.state.queue.len();
        self.state.queue.clear();
        len
    }

    async fn handle_queue_remove(&mut self, position: usize) -> Result<QueuedTrack> {
        if position == 0 {
            bail!("Position must be 1 or greater.");
        }
        self.state
            .queue
            .remove(position - 1)
            .context("Position out of bounds. No such track in the queue.")
    }

    fn handle_queue_shuffle(&mut self) -> usize {
        let count = self.state.queue.len();
        self.state.queue.make_contiguous().shuffle(&mut rand::rng());
        count
    }

    async fn handle_queue_jump(&mut self, position: usize) -> Result<StartedTrackInfo> {
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

        let title = target.metadata.title.as_deref().unwrap_or("untitled").to_string();
        let thumbnail = target.metadata.thumbnail.clone();

        if let Some(handle) = self.state.current.as_ref() {
            let _ = handle.stop();
        }

        self.start_playback(
            None,
            target.query,
            target.requested_by,
            Some(target.metadata),
            OldTrackDisposition::History,
        )
            .await?;

        Ok(StartedTrackInfo { title, thumbnail })
    }

    fn handle_history_list(&self) -> Vec<QueuedTrack> {
        self.state.history.iter().rev().cloned().collect()
    }

    async fn handle_history_jump(&mut self, position: usize) -> Result<StartedTrackInfo> {
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

        let title = target.metadata.title.as_deref().unwrap_or("untitled").to_string();
        let thumbnail = target.metadata.thumbnail.clone();

        if let Some(handle) = self.state.current.as_ref() {
            let _ = handle.stop();
        }

        self.start_playback(
            None,
            target.query,
            target.requested_by,
            Some(target.metadata),
            OldTrackDisposition::History,
        )
            .await?;

        Ok(StartedTrackInfo { title, thumbnail })
    }

    fn handle_now_playing(&self) -> Option<QueuedTrack> {
        self.state.current_track.clone()
    }

    async fn handle_stop(&mut self) -> Result<()> {
        self.state.queue.clear();

        if let Some(finished) = self.state.current_track.take() {
            self.state.push_history(finished);
        }

        if let Some(handle) = self.state.current.take() {
            let _ = handle.stop();
        }

        self.state.current_meta = None;

        if self.manager.get(self.guild_id).is_some() {
            self.manager
                .remove(self.guild_id)
                .await
                .context("Failed to leave voice channel")?;
        }

        Ok(())
    }

    async fn handle_pause(&mut self) -> Result<()> {
        let handle = self.state.current
            .as_ref()
            .context("Nothing is currently playing.")?;

        handle.pause().context("Failed to pause audio stream")?;
        Ok(())
    }

    async fn handle_resume(&mut self) -> Result<()> {
        let handle = self.state.current
            .as_ref()
            .context("Nothing is currently playing.")?;

        handle.play().context("Failed to resume audio stream")?;

        Ok(())
    }

    async fn handle_track_ended(&mut self, uuid: Uuid) {
        if self.state.current.as_ref().map(|h| h.uuid()) != Some(uuid) {
            return;
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
                    next.requested_by,
                    None,
                    OldTrackDisposition::History,
                )
                .await;
        }
    }

    async fn handle_seek(&mut self, input: String) -> Result<Duration> {
        let handle = self
            .state
            .current
            .as_ref()
            .context("Nothing is currently playing.")?;

        let seek_mode = parse_seek_input(&input)
            .context("Invalid input! Use timestamps like `1:30` or offsets like `+30`, `-15`, `+1:30`.")?;

        let current_pos = handle
            .get_info()
            .await
            .map(|info| info.position)
            .unwrap_or(Duration::ZERO);

        let target = match seek_mode {
            SeekMode::Absolute(dur) => dur,
            SeekMode::RelativeForward(delta) => current_pos + delta,
            SeekMode::RelativeBackward(delta) => current_pos.saturating_sub(delta),
        };

        if let Some(total_duration) = self.state.current_meta.as_ref()
            .and_then(|m| m.duration)
            .filter(|&dur| target > dur)
        {
            bail!(
                "Cannot seek past the end of the track (Duration: `{}`).",
                format_duration(Some(total_duration))
            );
        }

        handle
            .seek_async(target)
            .await
            .context("Failed to seek in current audio stream.")?;

        Ok(target)
    }

    async fn process_command(&mut self, cmd: GuildCommand) {
        match cmd {
            GuildCommand::Play { query, vc_channel_id, requested_by, respond } => {
                let _ = respond.send(self.handle_play(query, vc_channel_id, requested_by).await);
            }
            GuildCommand::Skip { respond } => { let _ = respond.send(self.handle_skip().await); }
            GuildCommand::Prev { vc_channel_id, respond } => { let _ = respond.send(self.handle_prev(vc_channel_id).await); }
            GuildCommand::QueueAdd { query, vc_channel_id, requested_by, respond } => {
                let _ = respond.send(self.handle_queue_add(query, vc_channel_id, requested_by).await);
            }
            GuildCommand::QueueList { respond } => { let _ = respond.send(Ok(self.handle_queue_list())); }
            GuildCommand::QueueClear { respond } => { let _ = respond.send(Ok(self.handle_queue_clear().await)); }
            GuildCommand::QueueRemove { position, respond } => { let _ = respond.send(self.handle_queue_remove(position).await); }
            GuildCommand::QueueShuffle { respond } => { let _ = respond.send(Ok(self.handle_queue_shuffle())); }
            GuildCommand::QueueJump { position, respond } => { let _ = respond.send(self.handle_queue_jump(position).await); }
            GuildCommand::HistoryList { respond } => { let _ = respond.send(Ok(self.handle_history_list())); }
            GuildCommand::HistoryJump { position, respond } => { let _ = respond.send(self.handle_history_jump(position).await); }
            GuildCommand::NowPlaying { respond } => { let _ = respond.send(Ok(self.handle_now_playing())); }
            GuildCommand::TrackEnded { uuid } => self.handle_track_ended(uuid).await,
            GuildCommand::Restart { respond } => { let _ = respond.send(self.handle_restart().await); }
            GuildCommand::Stop { respond } => { let _ = respond.send(self.handle_stop().await); }
            GuildCommand::Pause { respond } => { let _ = respond.send(self.handle_pause().await); }
            GuildCommand::Resume { respond } => { let _ = respond.send(self.handle_resume().await); }
            GuildCommand::Seek { input, respond } => { let _ = respond.send(self.handle_seek(input).await); }
        }
    }

    pub async fn run(mut self) {
        while let Some(cmd) = self.command_rx.recv().await {
            self.process_command(cmd).await;
        }
    }

    async fn start_playback(
        &mut self,
        vc_channel_id: Option<ChannelId>,
        query: String,
        requested_by: Arc<str>,
        cached_meta: Option<AuxMetadata>,
        disposition: OldTrackDisposition,
    ) -> Result<StartedTrackInfo> {
        let call = match self.manager.get(self.guild_id) {
            Some(call) => call,
            None => {
                let channel_id = vc_channel_id
                    .context("Not connected to a voice channel and no channel provided")?;
                self.manager.join(self.guild_id, channel_id).await?
            }
        };

        let started = prepare_and_play(
            self.services(),
            &call,
            query,
            requested_by,
            cached_meta,
        )
            .await?;

        let title = started.metadata.title.as_deref().unwrap_or("untitled").to_string();
        let thumbnail = started.metadata.thumbnail.clone();

        let old_handle = install_new_track(&mut self.state, started, disposition);

        if let Some(old_handle) = old_handle {
            let _ = old_handle.stop();
        }

        Ok(StartedTrackInfo { title, thumbnail })
    }
}