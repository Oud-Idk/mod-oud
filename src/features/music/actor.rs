use crate::features::music::player::{install_new_track, prepare_and_play, fetch_metadata, PlaybackServices, OldTrackDisposition, parse_timestamp, SeekMode, format_duration};
use crate::features::music::state::{GuildPlayer, QueuedTrack, QueueAddOutcome, QueueSnapshot, StartedTrackInfo};
use serenity::all::{ChannelId, GuildId, User};
use songbird::Songbird;
use songbird::input::AuxMetadata;
use std::sync::Arc;
use anyhow::{bail, Context, Result};
use core::time::Duration;
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

async fn resolve_spotify_url(client: &reqwest::Client, url: &str) -> Option<String> {
    if url.contains("open.spotify.com/") || url.contains("spotify:") {
        debug!(url = %url, "Attempting to resolve Spotify URL via oembed API");
        let oembed_url = format!("https://open.spotify.com/oembed?url={}", url);
        if let Ok(res) = client.get(&oembed_url).send().await {
            if let Ok(json) = res.json::<serde_json::Value>().await {
                let title = json.get("title").and_then(|v| v.as_str())?;
                let author = json.get("author_name").and_then(|v| v.as_str()).unwrap_or("");

                let search_term = if !author.is_empty() {
                    format!("ytsearch:{} {}", author, title)
                } else {
                    format!("ytsearch:{}", title)
                };
                debug!(url = %url, title = %title, author = %author, search_term = %search_term, "Resolved Spotify URL into YouTube search term");
                return Some(search_term);
            } else {
                warn!(url = %url, "Failed to parse Spotify oembed JSON payload");
            }
        } else {
            warn!(url = %url, "Failed to reach Spotify oembed endpoint");
        }
    }
    None
}

async fn build_query_url(client: &reqwest::Client, query: &str) -> String {
    debug!(query = %query, "Resolving query URL");
    if let Some(spotify_query) = resolve_spotify_url(client, query).await {
        return spotify_query;
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
        respond: oneshot::Sender<Result<StartedTrackInfo>>,
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
    }
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
    ) -> Result<StartedTrackInfo> {
        let call = match self.manager.get(self.guild_id) {
            Some(call) => call,
            None => self.manager.join(self.guild_id, vc_channel_id).await?,
        };

        let query_url = build_query_url(&self.reqwest_client, &query).await;

        let services = PlaybackServices {
            reqwest_client: &self.reqwest_client,
            command_tx: self.command_tx.clone(),
            guild_id: self.guild_id,
        };

        let started = prepare_and_play(
            services,
            &call,
            query_url,
            requested_by.name.clone(),
            None,
        ).await?;

        let title = started.metadata.title.as_deref().unwrap_or("untitled").to_string();
        let thumbnail = started.metadata.thumbnail.clone();

        if let Some(old_track) = self.state.current_track.take() {
            self.state.history.push(old_track);
        }

        let old_handle = self.state.current.take();
        self.state.current = Some(started.handle);
        self.state.current_track = Some(started.track);
        self.state.current_meta = Some(started.metadata);

        if let Some(old_handle) = old_handle {
            let _ = old_handle.stop();
        }

        Ok(StartedTrackInfo { title, thumbnail })
    }

    async fn handle_restart(&mut self) -> Result<StartedTrackInfo> {
        let current_track = self
            .state
            .current_track
            .clone()
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
            self.state.history.push(finished);
        }
        self.state.current = None;
        self.state.current_meta = None;

        if let Some(next) = self.state.queue.pop_front() {
            let _ = self
                .start_playback(
                    None,
                    next.query,
                    next.requested_by,
                    Some(next.metadata),
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

    async fn handle_queue_add(
        &mut self,
        query: String,
        vc_channel_id: ChannelId,
        requested_by: User,
    ) -> Result<QueueAddOutcome> {
        let query_url = build_query_url(&self.reqwest_client, &query).await;
        let metadata = fetch_metadata(self.services(), &query_url).await?;

        let title = metadata.title.as_deref().unwrap_or("untitled").to_string();
        let thumbnail = metadata.thumbnail.clone();
        let queued = QueuedTrack {
            query: metadata.source_url.clone().unwrap_or(query_url),
            metadata,
            requested_by: requested_by.name.clone(),
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
                    Some(queued.metadata.clone()),
                    OldTrackDisposition::History,
                )
                .await?;
            Ok(QueueAddOutcome::Played(StartedTrackInfo { title, thumbnail }))
        }
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

    async fn handle_stop(&mut self) -> Result<()> {
        self.state.queue.clear();

        if let Some(finished) = self.state.current_track.take() {
            self.state.history.push(finished);
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
            return; // Ignore stale end events
        }

        if let Some(finished) = self.state.current_track.take() {
            self.state.history.push(finished);
        }
        self.state.current = None;
        self.state.current_meta = None;

        if let Some(next) = self.state.queue.pop_front() {
            let _ = self
                .start_playback(
                    None,
                    next.query,
                    next.requested_by,
                    Some(next.metadata),
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

        // Get current playhead position
        let current_pos = handle
            .get_info()
            .await
            .map(|info| info.position)
            .unwrap_or(Duration::ZERO);

        // Calculate target duration
        let target = match seek_mode {
            SeekMode::Absolute(dur) => dur,
            SeekMode::RelativeForward(delta) => current_pos + delta,
            SeekMode::RelativeBackward(delta) => current_pos.saturating_sub(delta),
        };

        // Boundary check against track total duration
        if let Some(total_duration) = self.state.current_meta.as_ref()
            .and_then(|m| m.duration)
            .filter(|&dur| target > dur)
        {
            bail!(
                "Cannot seek past the end of the track (Duration: `{}`).",
                format_duration(Some(total_duration))
            );
        }

        // Execute seek on audio handle
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
        requested_by: String,
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
