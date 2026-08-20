use crate::features::music::player::{
    OldTrackDisposition, PlaybackServices, SeekMode, fetch_metadata, install_new_track,
    is_live_stream, parse_timestamp, prepare_and_play,
};
use crate::features::music::spotify::{resolve_spotify_playlist, resolve_spotify_track};
use crate::features::music::state::{
    GuildPlayer, NowPlayingResponse, PlayOutcome, QueueAddOutcome, QueueSnapshot, QueuedTrack,
    StartedTrackInfo,
};
use crate::features::music::stats::{StatsTx, record_track_end, record_track_start};
use crate::features::music::youtube::{resolve_youtube_playlist, resolve_youtube_video};
use anyhow::{Context, Result, bail};
use async_trait::async_trait;
use core::time::Duration;
use rand::seq::SliceRandom;
use serenity::all::{ChannelId, GuildId, User};
use songbird::CoreEvent;
use songbird::Songbird;
use songbird::events::{Event, EventContext, EventHandler as VoiceEventHandler};
use songbird::input::AuxMetadata;
use songbird::tracks::TrackHandle;
use std::sync::Arc;
use std::vec::IntoIter;
use tokio::sync::{broadcast, mpsc, oneshot};
use tokio::time::{Instant, timeout};
use tracing::{debug, warn};
use uuid::Uuid;

struct DriverDisconnectHandler {
    command_tx: mpsc::Sender<GuildCommand>,
}

#[async_trait]
impl VoiceEventHandler for DriverDisconnectHandler {
    async fn act(&self, _ctx: &EventContext<'_>) -> Option<Event> {
        let (respond_tx, _) = tokio::sync::oneshot::channel();
        let _ = self
            .command_tx
            .send(GuildCommand::Stop {
                respond: respond_tx,
            })
            .await;
        None
    }
}

pub struct GuildActor {
    pub guild_id: GuildId,
    pub manager: Arc<Songbird>,
    pub reqwest_client: reqwest::Client,
    pub stats_tx: StatsTx,
    pub events_tx: broadcast::Sender<(u64, Option<NowPlayingResponse>)>,
    pub command_rx: mpsc::Receiver<GuildCommand>,
    pub command_tx: mpsc::Sender<GuildCommand>,
    pub state: GuildPlayer,
    pub retry_count: usize,
    pub last_seek_at: Option<std::time::Instant>,
    pub last_seek_target_sec: f64,
    pub seek_in_flight: bool,
    pub last_live_reconnect_at: Option<std::time::Instant>,
}

/// Resolves single queries (Spotify URLs, `YouTube` video URLs, or plain text searches).
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
        let search_query = format!("ytsearch:{query}");
        debug!(query = %query, search_query = %search_query, "Constructed ytsearch query");
        search_query
    }
}

/// Helper method to try resolving either Spotify or `YouTube` playlists into track search terms/URLs.
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

pub struct PlayPayload {
    pub query: String,
    pub vc_channel_id: ChannelId,
    pub requested_by_name: String,
    pub requested_by_id: u64,
    pub respond: oneshot::Sender<Result<PlayOutcome>>,
}

pub struct QueueAddPayload {
    pub query: String,
    pub vc_channel_id: ChannelId,
    pub requested_by: User,
    pub respond: oneshot::Sender<Result<QueueAddOutcome>>,
}

pub enum GuildCommand {
    Play(Box<PlayPayload>),
    WebPlay(Box<PlayPayload>),
    QueueAdd(Box<QueueAddPayload>),

    Skip {
        respond: oneshot::Sender<Result<Option<String>>>,
    },
    Prev {
        vc_channel_id: ChannelId,
        respond: oneshot::Sender<Result<StartedTrackInfo>>,
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
        respond: oneshot::Sender<Result<Option<NowPlayingResponse>>>,
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
    GoToChannel {
        vc_channel_id: ChannelId,
        respond: oneshot::Sender<Result<()>>,
    },
}

impl GuildActor {
    pub fn new(
        guild_id: GuildId,
        manager: Arc<Songbird>,
        reqwest_client: reqwest::Client,
        stats_tx: StatsTx,
        events_tx: broadcast::Sender<(u64, Option<NowPlayingResponse>)>,
        command_tx: mpsc::Sender<GuildCommand>,
        command_rx: mpsc::Receiver<GuildCommand>,
    ) -> Self {
        Self {
            guild_id,
            manager,
            reqwest_client,
            stats_tx,
            events_tx,
            command_tx,
            command_rx,
            state: GuildPlayer::default(),
            retry_count: 0,
            last_seek_at: None,
            last_seek_target_sec: 0.0,
            seek_in_flight: false,
            last_live_reconnect_at: None,
        }
    }

    pub fn spawn(
        guild_id: GuildId,
        manager: Arc<Songbird>,
        reqwest_client: reqwest::Client,
        stats_tx: StatsTx,
        events_tx: broadcast::Sender<(u64, Option<NowPlayingResponse>)>,
    ) -> mpsc::Sender<GuildCommand> {
        let (tx, rx) = mpsc::channel(32);
        let actor = Self::new(
            guild_id,
            manager,
            reqwest_client,
            stats_tx,
            events_tx,
            tx.clone(),
            rx,
        );

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
        requested_by_name: String,
        requested_by_id: u64,
    ) -> Result<PlayOutcome> {
        self.retry_count = 0;
        let requester: Arc<str> = Arc::from(requested_by_name.as_str());

        if let Some(search_terms) = resolve_any_playlist(&self.reqwest_client, &query).await {
            let total_tracks = search_terms.len();
            if total_tracks == 0 {
                bail!("Playlist appears to be empty!");
            }

            let mut terms_iter = search_terms.into_iter();
            let first_term = terms_iter.next().context("Playlist was empty!")?;

            // Eagerly fetch YouTube metadata for Track #1 and start playing immediately
            let first_track = self
                .start_playback(
                    Some(vc_channel_id),
                    first_term,
                    requester.clone(),
                    requested_by_id,
                    None,
                    OldTrackDisposition::History,
                )
                .await?;

            self.populate_queue(&requester, requested_by_id, &mut terms_iter);

            return Ok(PlayOutcome::Playlist {
                first_track,
                count: total_tracks,
            });
        }

        let query_url = build_query_url(&self.reqwest_client, &query).await;

        let first_track = self
            .start_playback(
                Some(vc_channel_id),
                query_url,
                requester,
                requested_by_id,
                None,
                OldTrackDisposition::History,
            )
            .await?;

        Ok(PlayOutcome::Single(first_track))
    }

    async fn handle_queue_add(
        &mut self,
        query: String,
        vc_channel_id: ChannelId,
        requested_by: User,
    ) -> Result<QueueAddOutcome> {
        let requester: Arc<str> = Arc::from(requested_by.name.as_str());
        let requested_by_id = requested_by.id.get();

        if let Some(search_terms) = resolve_any_playlist(&self.reqwest_client, &query).await {
            let total_tracks = search_terms.len();
            if total_tracks == 0 {
                bail!("Playlist appears to be empty!");
            }

            let mut terms_iter = search_terms.into_iter();
            let first_term = terms_iter.next().context("Playlist was empty!")?;

            let mut first_meta = fetch_metadata(self.services(), &first_term).await?;
            let title = first_meta
                .title
                .as_deref()
                .unwrap_or("untitled")
                .to_string();
            let thumbnail = first_meta.thumbnail.clone();

            let first_queued = QueuedTrack {
                query: first_meta.source_url.take().unwrap_or(first_term),
                metadata: first_meta.clone(),
                requested_by: requester.clone(),
                requested_by_id,
            };

            let first_track_info = StartedTrackInfo { title, thumbnail };

            if self.state.current.is_none() {
                // Play song #1 immediately!
                self.start_playback(
                    Some(vc_channel_id),
                    first_queued.query,
                    first_queued.requested_by,
                    first_queued.requested_by_id,
                    Some(first_queued.metadata),
                    OldTrackDisposition::History,
                )
                .await?;
            } else {
                // If something is already playing, push song #1 to queue
                self.state.queue.push_back(first_queued);
            }

            self.populate_queue(&requester, requested_by_id, &mut terms_iter);

            return Ok(QueueAddOutcome::PlaylistQueued {
                count: total_tracks,
                first_track: first_track_info,
            });
        }

        let query_url = build_query_url(&self.reqwest_client, &query).await;
        let metadata = fetch_metadata(self.services(), &query_url).await?;

        let title = metadata.title.as_deref().unwrap_or("untitled").to_string();
        let thumbnail = metadata.thumbnail.clone();
        let queued = QueuedTrack {
            query,
            metadata,
            requested_by: requester.clone(),
            requested_by_id,
        };

        if self.state.current.is_some() {
            self.state.queue.push_back(queued);
            Ok(QueueAddOutcome::Queued(StartedTrackInfo {
                title,
                thumbnail,
            }))
        } else {
            let _ = self
                .start_playback(
                    Some(vc_channel_id),
                    queued.query,
                    queued.requested_by,
                    queued.requested_by_id,
                    Some(queued.metadata),
                    OldTrackDisposition::History,
                )
                .await?;
            Ok(QueueAddOutcome::Played(StartedTrackInfo {
                title,
                thumbnail,
            }))
        }
    }

    fn populate_queue(
        &mut self,
        requested_by: &Arc<str>,
        requested_by_id: u64,
        terms_iter: &mut IntoIter<String>,
    ) {
        for search_term in terms_iter {
            let display_title = search_term
                .strip_prefix("ytsearch:")
                .unwrap_or(&search_term)
                .to_string();

            let placeholder_meta = AuxMetadata {
                title: Some(display_title),
                ..AuxMetadata::default()
            };

            self.state.queue.push_back(QueuedTrack {
                query: search_term,
                metadata: placeholder_meta,
                requested_by: requested_by.clone(),
                requested_by_id,
            });
        }
    }

    async fn handle_restart(&mut self) -> Result<StartedTrackInfo> {
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
                    let req_id = self
                        .state
                        .current_track
                        .as_ref()
                        .map_or(0, |t| t.requested_by_id);
                    record_track_start(&self.stats_tx, self.guild_id, req_id, handle.uuid(), meta);
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
            current_track.requested_by,
            current_track.requested_by_id,
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
                    next.requested_by,
                    next.requested_by_id,
                    None,
                    OldTrackDisposition::History,
                )
                .await;
        }

        self.broadcast_state().await;

        Ok(next_title)
    }

    async fn handle_prev(&mut self, vc_channel_id: ChannelId) -> Result<StartedTrackInfo> {
        let previous = self
            .state
            .history
            .pop()
            .context("No previous track in history.")?;

        let started = self
            .start_playback(
                Some(vc_channel_id),
                previous.query,
                previous.requested_by,
                previous.requested_by_id,
                Some(previous.metadata),
                OldTrackDisposition::QueueFront,
            )
            .await?;

        self.broadcast_state().await;

        Ok(started)
    }

    fn handle_queue_list(&self) -> QueueSnapshot {
        QueueSnapshot {
            current_meta: self.state.current_meta.clone(),
            queue: self.state.queue.iter().cloned().collect(),
        }
    }

    fn handle_queue_clear(&mut self) -> usize {
        let len = self.state.queue.len();
        self.state.queue.clear();
        len
    }

    fn handle_queue_remove(&mut self, position: usize) -> Result<QueuedTrack> {
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
            target.requested_by,
            target.requested_by_id,
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
            target.requested_by,
            target.requested_by_id,
            Some(target.metadata),
            OldTrackDisposition::History,
        )
        .await?;

        Ok(StartedTrackInfo { title, thumbnail })
    }

    async fn handle_now_playing(&self) -> Option<NowPlayingResponse> {
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

    async fn handle_stop(&mut self) -> Result<()> {
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

    async fn handle_pause(&mut self) -> Result<()> {
        let handle = self
            .state
            .current
            .as_ref()
            .context("Nothing is currently playing.")?;

        handle.pause().context("Failed to pause audio stream")?;

        if self.state.current_paused_at.is_none() {
            self.state.current_paused_at = Some(Instant::now());
        }

        self.broadcast_state().await;
        Ok(())
    }

    async fn handle_resume(&mut self) -> Result<()> {
        let handle = self
            .state
            .current
            .as_ref()
            .context("Nothing is currently playing.")?;

        handle.play().context("Failed to resume audio stream")?;

        if let Some(paused_at) = self.state.current_paused_at.take() {
            self.state.current_paused_total += paused_at.elapsed();
        }

        self.broadcast_state().await;
        Ok(())
    }

    async fn handle_track_ended(&mut self, uuid: Uuid) {
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
        // Reconnect failed (e.g. the streamer went offline): fall through
        // to the natural-end handling so the queue can advance.

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
                let fresh_query_url =
                    build_query_url(&self.reqwest_client, &current_track.query).await;

                let info = self
                    .start_playback(
                        None,
                        fresh_query_url, // Pass freshly resolved URL
                        current_track.requested_by,
                        current_track.requested_by_id,
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
                    next.requested_by,
                    next.requested_by_id,
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
    async fn reconnect_live_stream(&mut self) -> bool {
        // Safety valve: if the source keeps dropping faster than this, treat it
        // as genuinely dead and let the queue advance instead of reconnect-spamming.
        const MIN_RECONNECT_INTERVAL: Duration = Duration::from_secs(5);
        if let Some(last) = self.last_live_reconnect_at
            && last.elapsed() < MIN_RECONNECT_INTERVAL
        {
            warn!(guild_id = %self.guild_id, "Live stream dropped again too quickly; advancing the queue");
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

        let fresh_query_url = build_query_url(&self.reqwest_client, &current_track.query).await;

        match prepare_and_play(
            self.services(),
            &call,
            fresh_query_url,
            current_track.requested_by,
            current_track.requested_by_id,
            Some(current_track.metadata),
        )
        .await
        {
            Ok(started) => {
                self.last_live_reconnect_at = Some(std::time::Instant::now());
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
                warn!(error = ?e, guild_id = %self.guild_id, "Failed to reconnect live stream");
                self.broadcast_state().await;
                false
            }
        }
    }

    /// Moves the bot's voice connection to another channel (joins if not connected).
    async fn handle_go_to_channel(&self, channel_id: ChannelId) -> Result<()> {
        self.manager.join(self.guild_id, channel_id).await?;
        Ok(())
    }

    async fn handle_seek(&mut self, input: String) -> Result<Duration> {
        if self.seek_in_flight {
            bail!("A seek is already in progress, please wait.");
        }

        if self.state.current_meta.as_ref().is_some_and(is_live_stream) {
            bail!("Cannot seek in a live stream.");
        }

        if let Some(last_seek) = self.last_seek_at
            && last_seek.elapsed() < Duration::from_millis(400)
        {
            bail!("Seeking too quickly! Please wait a moment between seeks.");
        }

        let handle = self
            .state
            .current
            .as_ref()
            .context("Nothing is currently playing.")?;
        let seek_mode = parse_seek_input(&input).context(
            "Invalid input! Use timestamps like `1:30` or offsets like `+30`, `-15`, `+1:30`.",
        )?;

        self.last_seek_at = Some(std::time::Instant::now());

        let estimated_wall_clock = self.state.current_started_at.map_or(0.0, |st| {
            st.elapsed()
                .saturating_sub(self.state.current_paused_total)
                .as_secs_f64()
        });
        let fallback_pos =
            Duration::from_secs_f64(self.last_seek_target_sec + estimated_wall_clock);

        let current_pos = match timeout(Duration::from_millis(500), handle.get_info()).await {
            Ok(Ok(info)) => info.position,
            _ => fallback_pos,
        };

        let mut target = match seek_mode {
            SeekMode::Absolute(dur) => dur,
            SeekMode::RelativeForward(delta) => current_pos + delta,
            SeekMode::RelativeBackward(delta) => current_pos.saturating_sub(delta),
        };

        if let Some(total_duration) = self.state.current_meta.as_ref().and_then(|m| m.duration)
            && target >= total_duration
        {
            target = total_duration.saturating_sub(Duration::from_millis(500));
        }

        self.seek_in_flight = true;
        let result = timeout(Duration::from_secs(4), handle.seek_async(target)).await;
        self.seek_in_flight = false;

        match result {
            Ok(Ok(_)) => {
                self.last_seek_target_sec = target.as_secs_f64();
                self.state.current_started_at = Some(Instant::now());
                self.state.current_paused_at = None;
                self.state.current_paused_total = Duration::ZERO;
                self.broadcast_state_with_position(target.as_secs_f64())
                    .await;
                Ok(target)
            }
            Ok(Err(e)) => bail!("Seek failed on audio engine: {e:?}"),
            Err(_) => bail!("Seek timed out while waiting for media buffer. Try again."),
        }
    }

    async fn process_command(&mut self, cmd: GuildCommand) {
        match cmd {
            GuildCommand::Play(payload) | GuildCommand::WebPlay(payload) => {
                let PlayPayload {
                    query,
                    vc_channel_id,
                    requested_by_name,
                    requested_by_id,
                    respond,
                } = *payload;
                let _ = respond.send(
                    self.handle_play(query, vc_channel_id, requested_by_name, requested_by_id)
                        .await,
                );
            }
            GuildCommand::Skip { respond } => {
                let _ = respond.send(self.handle_skip().await);
            }
            GuildCommand::Prev {
                vc_channel_id,
                respond,
            } => {
                let _ = respond.send(self.handle_prev(vc_channel_id).await);
            }
            GuildCommand::QueueAdd(payload) => {
                let QueueAddPayload {
                    query,
                    vc_channel_id,
                    requested_by,
                    respond,
                } = *payload;
                let _ = respond.send(
                    self.handle_queue_add(query, vc_channel_id, requested_by)
                        .await,
                );
            }
            GuildCommand::QueueList { respond } => {
                let _ = respond.send(Ok(self.handle_queue_list()));
            }
            GuildCommand::QueueClear { respond } => {
                let _ = respond.send(Ok(self.handle_queue_clear()));
            }
            GuildCommand::QueueRemove { position, respond } => {
                let _ = respond.send(self.handle_queue_remove(position));
            }
            GuildCommand::QueueShuffle { respond } => {
                let _ = respond.send(Ok(self.handle_queue_shuffle()));
            }
            GuildCommand::QueueJump { position, respond } => {
                let _ = respond.send(self.handle_queue_jump(position).await);
            }
            GuildCommand::HistoryList { respond } => {
                let _ = respond.send(Ok(self.handle_history_list()));
            }
            GuildCommand::HistoryJump { position, respond } => {
                let _ = respond.send(self.handle_history_jump(position).await);
            }
            GuildCommand::NowPlaying { respond } => {
                let _ = respond.send(Ok(self.handle_now_playing().await));
            }
            GuildCommand::TrackEnded { uuid } => self.handle_track_ended(uuid).await,
            GuildCommand::Restart { respond } => {
                let _ = respond.send(self.handle_restart().await);
            }
            GuildCommand::Stop { respond } => {
                let _ = respond.send(self.handle_stop().await);
            }
            GuildCommand::Pause { respond } => {
                let _ = respond.send(self.handle_pause().await);
            }
            GuildCommand::Resume { respond } => {
                let _ = respond.send(self.handle_resume().await);
            }
            GuildCommand::Seek { input, respond } => {
                let _ = respond.send(self.handle_seek(input).await);
            }
            GuildCommand::GoToChannel {
                vc_channel_id,
                respond,
            } => {
                let _ = respond.send(self.handle_go_to_channel(vc_channel_id).await);
            }
        }
    }

    pub async fn broadcast_state(&self) {
        let now_playing = self.handle_now_playing().await;
        let _ = self.events_tx.send((self.guild_id.get(), now_playing));
    }

    /// Broadcasts track state while overriding `position_sec` with the exact seek target,
    /// avoiding Songbird's async `get_info()` race condition.
    pub async fn broadcast_state_with_position(&self, override_pos_sec: f64) {
        let mut now_playing = self.handle_now_playing().await;
        if let Some(ref mut np) = now_playing {
            np.position_sec = override_pos_sec;
        }
        let _ = self.events_tx.send((self.guild_id.get(), now_playing));
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
        requested_by_id: u64,
        cached_meta: Option<AuxMetadata>,
        disposition: OldTrackDisposition,
    ) -> Result<StartedTrackInfo> {
        let call = if let Some(call) = self.manager.get(self.guild_id) {
            call
        } else {
            let channel_id = vc_channel_id
                .context("Not connected to a voice channel and no channel provided")?;
            self.manager.join(self.guild_id, channel_id).await?
        };

        {
            let mut call_lock = call.lock().await;
            call_lock.add_global_event(
                Event::Core(CoreEvent::DriverDisconnect),
                DriverDisconnectHandler {
                    command_tx: self.command_tx.clone(),
                },
            );
        }

        // Finish stats and stop old track BEFORE installing the new track state
        if let Some(old_handle) = self.state.current.take() {
            self.finish_play_stats(&old_handle);
            let _ = old_handle.stop();
        }

        let started = prepare_and_play(
            self.services(),
            &call,
            query,
            requested_by,
            requested_by_id,
            cached_meta,
        )
        .await?;

        let handle_uuid = started.handle.uuid();
        let title = started
            .metadata
            .title
            .as_deref()
            .unwrap_or("untitled")
            .to_string();
        let thumbnail = started.metadata.thumbnail.clone();

        let _ = install_new_track(&mut self.state, started, disposition);

        self.last_seek_target_sec = 0.0;
        self.state.current_started_at = Some(Instant::now());
        self.state.current_paused_at = None;
        self.state.current_paused_total = Duration::ZERO;

        if let Some(meta) = self.state.current_meta.as_ref() {
            record_track_start(
                &self.stats_tx,
                self.guild_id,
                requested_by_id,
                handle_uuid,
                meta,
            );
        }

        self.broadcast_state().await;

        Ok(StartedTrackInfo { title, thumbnail })
    }

    /// Non-blocking: enqueues the "ended" event for the current play, backfilled
    /// against the matching `handle_uuid` by the stats worker.
    fn finish_play_stats(&mut self, handle: &TrackHandle) {
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
