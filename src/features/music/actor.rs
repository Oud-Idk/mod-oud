mod broadcast;
mod commands;
mod disconnect;
mod play;
mod queue;
mod recovery;
mod resolve;
mod seek;
mod transport;

pub use commands::{GuildCommand, PlayPayload, QueueAddPayload, Requester};

use crate::features::music::player::PlaybackServices;
use crate::features::music::state::GuildPlayer;
use crate::features::music::stats::StatsTx;
use crate::shared::spotify_auth::SpotifyAuthCache;
use crate::shared::task;
use fred::clients::Client;
use serenity::all::GuildId;
use songbird::Songbird;
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio::time::Instant;

pub struct GuildActor {
    pub guild_id: GuildId,
    pub manager: Arc<Songbird>,
    pub reqwest_client: reqwest::Client,
    pub stats_tx: StatsTx,
    pub redis: Client,
    pub command_rx: mpsc::Receiver<GuildCommand>,
    pub command_tx: mpsc::Sender<GuildCommand>,
    pub state: GuildPlayer,
    pub retry_count: usize,
    pub last_seek_at: Option<Instant>,
    pub last_seek_target_sec: f64,
    pub seek_in_flight: bool,
    pub last_live_reconnect_at: Option<Instant>,
    pub youtube_api_key: String,
    pub spotify_auth: Arc<SpotifyAuthCache>,
}

/// External services and configuration a [`GuildActor`] needs per guild.
pub struct GuildActorDeps {
    pub guild_id: GuildId,
    pub manager: Arc<Songbird>,
    pub reqwest_client: reqwest::Client,
    pub stats_tx: StatsTx,
    pub redis: Client,
    pub youtube_api_key: String,
    pub spotify_auth: Arc<SpotifyAuthCache>,
}

impl GuildActor {
    pub fn new(
        deps: GuildActorDeps,
        command_tx: mpsc::Sender<GuildCommand>,
        command_rx: mpsc::Receiver<GuildCommand>,
    ) -> Self {
        let GuildActorDeps {
            guild_id,
            manager,
            reqwest_client,
            stats_tx,
            redis,
            youtube_api_key,
            spotify_auth,
        } = deps;

        Self {
            guild_id,
            manager,
            reqwest_client,
            stats_tx,
            redis,
            command_tx,
            command_rx,
            youtube_api_key,
            spotify_auth,
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
        redis: Client,
        youtube_api_key: String,
        spotify_auth: Arc<SpotifyAuthCache>,
    ) -> mpsc::Sender<GuildCommand> {
        let (tx, rx) = mpsc::channel(32);
        let actor = Self::new(
            GuildActorDeps {
                guild_id,
                manager,
                reqwest_client,
                stats_tx,
                redis,
                youtube_api_key,
                spotify_auth,
            },
            tx.clone(),
            rx,
        );

        task::spawn("music_actor", async move {
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

    /// Runs one mailbox command to completion.
    /// Only `Play` and `QueueAdd` may await open-ended I/O.
    async fn process_command(&mut self, cmd: GuildCommand) {
        match cmd {
            GuildCommand::Play(payload) => {
                let PlayPayload {
                    query,
                    vc_channel_id,
                    requested_by,
                    respond,
                } = *payload;
                let _ = respond.send(self.handle_play(query, vc_channel_id, requested_by).await);
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

    pub async fn run(mut self) {
        while let Some(cmd) = self.command_rx.recv().await {
            self.process_command(cmd).await;
        }
    }
}
