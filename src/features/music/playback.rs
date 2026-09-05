//! Narrow method-based interface over the guild music actor mailbox.
//!
//! Each method hides the `mpsc` and `oneshot` plumbing so callers learn one
//! reply type per call instead of the channel protocol.

use crate::features::music::actor::{GuildCommand, PlayPayload, QueueAddPayload, Requester};
use crate::features::music::state::{
    NowPlayingResponse, PlayOutcome, QueueAddOutcome, QueueSnapshot, QueuedTrack, StartedTrackInfo,
};
use anyhow::{Context, Result};
use serenity::all::ChannelId;
use std::time::Duration;
use tokio::sync::{mpsc, oneshot};

/// Caller-facing handle to one guild's music actor.
#[derive(Clone, Debug)]
pub struct PlaybackHandle {
    tx: mpsc::Sender<GuildCommand>,
}

impl PlaybackHandle {
    /// Wraps an actor mailbox sender without spawning anything.
    #[must_use]
    pub const fn new(tx: mpsc::Sender<GuildCommand>) -> Self {
        Self { tx }
    }

    /// Sends one command and awaits its typed reply.
    ///
    /// Actor-side failures pass through unchanged; only transport failures
    /// (closed mailbox, dropped reply) gain context here.
    async fn call<T>(
        &self,
        build: impl FnOnce(oneshot::Sender<Result<T>>) -> GuildCommand,
    ) -> Result<T> {
        let (respond_tx, respond_rx) = oneshot::channel();
        self.tx
            .send(build(respond_tx))
            .await
            .context("music actor mailbox closed")?;
        respond_rx
            .await
            .context("music actor dropped the reply channel")?
    }

    /// Force-starts playback, stopping whatever is currently playing.
    ///
    /// # Errors
    ///
    /// Fails if the actor mailbox is closed, the reply is dropped, or the
    /// actor reports a failure.
    pub async fn play(
        &self,
        query: impl Into<String>,
        vc_channel_id: ChannelId,
        requested_by: Requester,
    ) -> Result<PlayOutcome> {
        self.call(|respond| {
            GuildCommand::Play(Box::new(PlayPayload {
                query: query.into(),
                vc_channel_id,
                requested_by,
                respond,
            }))
        })
        .await
    }

    /// Smart-enqueues: plays immediately if idle, appends if active.
    ///
    /// # Errors
    ///
    /// Fails if the actor mailbox is closed, the reply is dropped, or the
    /// actor reports a failure.
    pub async fn enqueue(
        &self,
        query: impl Into<String>,
        vc_channel_id: ChannelId,
        requested_by: Requester,
    ) -> Result<QueueAddOutcome> {
        self.call(|respond| {
            GuildCommand::QueueAdd(Box::new(QueueAddPayload {
                query: query.into(),
                vc_channel_id,
                requested_by,
                respond,
            }))
        })
        .await
    }

    /// Skips the current track, returning the next track's title if any.
    ///
    /// # Errors
    ///
    /// Fails if the actor mailbox is closed, the reply is dropped, or the
    /// actor reports a failure.
    pub async fn skip(&self) -> Result<Option<String>> {
        self.call(|respond| GuildCommand::Skip { respond }).await
    }

    /// Replays the most recent history entry, joining voice if disconnected.
    ///
    /// # Errors
    ///
    /// Fails if the actor mailbox is closed, the reply is dropped, or the
    /// actor reports a failure.
    pub async fn prev(&self, vc_channel_id: ChannelId) -> Result<StartedTrackInfo> {
        self.call(|respond| GuildCommand::Prev {
            vc_channel_id,
            respond,
        })
        .await
    }

    /// Snapshots the current track and upcoming queue.
    ///
    /// # Errors
    ///
    /// Fails if the actor mailbox is closed, the reply is dropped, or the
    /// actor reports a failure.
    pub async fn queue_snapshot(&self) -> Result<QueueSnapshot> {
        self.call(|respond| GuildCommand::QueueList { respond })
            .await
    }

    /// Clears pending tracks, returning how many were removed.
    ///
    /// # Errors
    ///
    /// Fails if the actor mailbox is closed, the reply is dropped, or the
    /// actor reports a failure.
    pub async fn queue_clear(&self) -> Result<usize> {
        self.call(|respond| GuildCommand::QueueClear { respond })
            .await
    }

    /// Removes the track at a 1-based position, returning it.
    ///
    /// # Errors
    ///
    /// Fails if the actor mailbox is closed, the reply is dropped, or the
    /// actor reports a failure.
    pub async fn queue_remove(&self, position: usize) -> Result<QueuedTrack> {
        self.call(|respond| GuildCommand::QueueRemove { position, respond })
            .await
    }

    /// Shuffles the queue, returning how many tracks were shuffled.
    ///
    /// # Errors
    ///
    /// Fails if the actor mailbox is closed, the reply is dropped, or the
    /// actor reports a failure.
    pub async fn queue_shuffle(&self) -> Result<usize> {
        self.call(|respond| GuildCommand::QueueShuffle { respond })
            .await
    }

    /// Jumps to the 1-based queue position, pushing skipped tracks to history.
    ///
    /// # Errors
    ///
    /// Fails if the actor mailbox is closed, the reply is dropped, or the
    /// actor reports a failure.
    pub async fn queue_jump(&self, position: usize) -> Result<StartedTrackInfo> {
        self.call(|respond| GuildCommand::QueueJump { position, respond })
            .await
    }

    /// Lists recently played tracks, most recent first.
    ///
    /// # Errors
    ///
    /// Fails if the actor mailbox is closed, the reply is dropped, or the
    /// actor reports a failure.
    pub async fn history_list(&self) -> Result<Vec<QueuedTrack>> {
        self.call(|respond| GuildCommand::HistoryList { respond })
            .await
    }

    /// Replays the history entry at a 1-based index, most recent first.
    ///
    /// # Errors
    ///
    /// Fails if the actor mailbox is closed, the reply is dropped, or the
    /// actor reports a failure.
    pub async fn history_jump(&self, position: usize) -> Result<StartedTrackInfo> {
        self.call(|respond| GuildCommand::HistoryJump { position, respond })
            .await
    }

    /// Reports live playback info, or `None` when nothing is playing.
    ///
    /// # Errors
    ///
    /// Fails if the actor mailbox is closed, the reply is dropped, or the
    /// actor reports a failure.
    pub async fn now_playing(&self) -> Result<Option<NowPlayingResponse>> {
        self.call(|respond| GuildCommand::NowPlaying { respond })
            .await
    }

    /// Restarts the current track from `0:00`.
    ///
    /// # Errors
    ///
    /// Fails if the actor mailbox is closed, the reply is dropped, or the
    /// actor reports a failure.
    pub async fn restart(&self) -> Result<StartedTrackInfo> {
        self.call(|respond| GuildCommand::Restart { respond }).await
    }

    /// Stops playback, clears the queue, and leaves voice.
    ///
    /// # Errors
    ///
    /// Fails if the actor mailbox is closed, the reply is dropped, or the
    /// actor reports a failure.
    pub async fn stop(&self) -> Result<()> {
        self.call(|respond| GuildCommand::Stop { respond }).await
    }

    /// Pauses the current track.
    ///
    /// # Errors
    ///
    /// Fails if the actor mailbox is closed, the reply is dropped, or the
    /// actor reports a failure.
    pub async fn pause(&self) -> Result<()> {
        self.call(|respond| GuildCommand::Pause { respond }).await
    }

    /// Resumes a paused track.
    ///
    /// # Errors
    ///
    /// Fails if the actor mailbox is closed, the reply is dropped, or the
    /// actor reports a failure.
    pub async fn resume(&self) -> Result<()> {
        self.call(|respond| GuildCommand::Resume { respond }).await
    }

    /// Seeks to an absolute (`1:30`) or relative (`+30`, `-15`) position.
    ///
    /// # Errors
    ///
    /// Fails if the actor mailbox is closed, the reply is dropped, or the
    /// actor reports a failure.
    pub async fn seek(&self, input: impl Into<String>) -> Result<Duration> {
        let input = input.into();
        self.call(|respond| GuildCommand::Seek { input, respond })
            .await
    }

    /// Moves the bot to another voice channel without interrupting playback.
    ///
    /// # Errors
    ///
    /// Fails if the actor mailbox is closed, the reply is dropped, or the
    /// actor reports a failure.
    pub async fn go_to_channel(&self, vc_channel_id: ChannelId) -> Result<()> {
        self.call(|respond| GuildCommand::GoToChannel {
            vc_channel_id,
            respond,
        })
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serenity::all::UserId;
    use std::sync::Arc;
    use tokio::task::JoinHandle;

    /// Spawns a fake actor that answers every command through `handler`.
    ///
    /// No Songbird, Redis, or network involved: the boundary under test is
    /// handle-method → mailbox variant → typed reply.
    fn spawn_fake(mut handler: impl FnMut(GuildCommand) + Send + 'static) -> PlaybackHandle {
        let (tx, mut rx) = mpsc::channel(16);
        tokio::spawn(async move {
            while let Some(cmd) = rx.recv().await {
                handler(cmd);
            }
        });
        PlaybackHandle::new(tx)
    }

    /// Spawns a fake actor and returns its join handle for lifecycle assertions.
    fn spawn_fake_tracked(
        mut handler: impl FnMut(GuildCommand) + Send + 'static,
    ) -> (PlaybackHandle, JoinHandle<()>) {
        let (tx, mut rx) = mpsc::channel(16);
        let join = tokio::spawn(async move {
            while let Some(cmd) = rx.recv().await {
                handler(cmd);
            }
        });
        (PlaybackHandle::new(tx), join)
    }

    fn track_info() -> StartedTrackInfo {
        StartedTrackInfo {
            title: "Never Gonna Give You Up".to_string(),
            thumbnail: Some("https://example.test/thumb.jpg".to_string()),
        }
    }

    #[tokio::test]
    async fn play_sends_single_play_with_forwarded_fields() {
        let (probe_tx, probe_rx) = oneshot::channel();
        let mut probe_tx = Some(probe_tx);
        let handle = spawn_fake(move |cmd| match cmd {
            GuildCommand::Play(payload) => {
                let _ = probe_tx.take().expect("play sent twice").send((
                    payload.query,
                    payload.vc_channel_id,
                    payload.requested_by,
                ));
                let _ = payload.respond.send(Ok(PlayOutcome::Single(track_info())));
            }
            GuildCommand::WebPlay(_) => panic!("handle must build Play, not WebPlay"),
            _ => panic!("expected Play"),
        });

        let requester = Requester {
            id: UserId::new(42),
            name: Arc::from("dj"),
        };
        let outcome = handle
            .play("never gonna", ChannelId::new(11), requester)
            .await
            .expect("play should succeed");

        let (query, vc, requester) = probe_rx.await.expect("probe should fire");
        assert_eq!(query, "never gonna");
        assert_eq!(vc, ChannelId::new(11));
        assert_eq!(requester.id, UserId::new(42));
        assert_eq!(&*requester.name, "dj");
        match outcome {
            PlayOutcome::Single(info) => assert_eq!(info.title, track_info().title),
            PlayOutcome::Playlist { .. } => panic!("expected Single"),
        }
    }

    #[tokio::test]
    async fn play_playlist_outcome_passes_through() {
        let handle = spawn_fake(move |cmd| match cmd {
            GuildCommand::Play(payload) => {
                let _ = payload.respond.send(Ok(PlayOutcome::Playlist {
                    first_track: track_info(),
                    count: 25,
                }));
            }
            _ => panic!("expected Play"),
        });

        match handle
            .play(
                "playlist",
                ChannelId::new(1),
                Requester {
                    id: UserId::new(7),
                    name: Arc::from("dj"),
                },
            )
            .await
            .expect("play should succeed")
        {
            PlayOutcome::Playlist { count, .. } => assert_eq!(count, 25),
            PlayOutcome::Single(_) => panic!("expected Playlist"),
        }
    }

    #[tokio::test]
    async fn enqueue_forwards_query_and_reports_outcome() {
        let requester = Requester {
            id: UserId::default(),
            name: Arc::from("dj"),
        };
        let expected = requester.clone();
        let handle = spawn_fake(move |cmd| match cmd {
            GuildCommand::QueueAdd(payload) => {
                assert_eq!(payload.query, "lofi beats");
                assert_eq!(payload.requested_by, expected);
                let _ = payload
                    .respond
                    .send(Ok(QueueAddOutcome::Queued(track_info())));
            }
            _ => panic!("expected QueueAdd"),
        });

        match handle
            .enqueue("lofi beats", ChannelId::new(3), requester)
            .await
            .expect("enqueue should succeed")
        {
            QueueAddOutcome::Queued(info) => assert_eq!(info.title, track_info().title),
            _ => panic!("expected Queued"),
        }
    }

    #[tokio::test]
    async fn transport_controls_round_trip() {
        let handle = spawn_fake(move |cmd| {
            let respond = match cmd {
                GuildCommand::Pause { respond }
                | GuildCommand::Resume { respond }
                | GuildCommand::Stop { respond } => respond,
                GuildCommand::Restart { respond } => {
                    let _ = respond.send(Ok(track_info()));
                    return;
                }
                _ => panic!("expected a transport control"),
            };
            let _ = respond.send(Ok(()));
        });

        handle.pause().await.expect("pause should succeed");
        handle.resume().await.expect("resume should succeed");
        let info = handle.restart().await.expect("restart should succeed");
        assert_eq!(info.title, track_info().title);
        handle.stop().await.expect("stop should succeed");
    }

    #[tokio::test]
    async fn skip_returns_next_title() {
        let handle = spawn_fake(move |cmd| match cmd {
            GuildCommand::Skip { respond } => {
                let _ = respond.send(Ok(Some("next song".to_string())));
            }
            _ => panic!("expected Skip"),
        });

        assert_eq!(
            handle.skip().await.expect("skip should succeed"),
            Some("next song".to_string())
        );
    }

    #[tokio::test]
    async fn prev_forwards_voice_channel() {
        let (probe_tx, probe_rx) = oneshot::channel();
        let mut probe_tx = Some(probe_tx);
        let handle = spawn_fake(move |cmd| match cmd {
            GuildCommand::Prev {
                vc_channel_id,
                respond,
            } => {
                let _ = probe_tx
                    .take()
                    .expect("prev sent twice")
                    .send(vc_channel_id);
                let _ = respond.send(Ok(track_info()));
            }
            _ => panic!("expected Prev"),
        });

        handle
            .prev(ChannelId::new(77))
            .await
            .expect("prev should succeed");
        assert_eq!(
            probe_rx.await.expect("probe should fire"),
            ChannelId::new(77)
        );
    }

    #[tokio::test]
    async fn queue_reads_round_trip() {
        let handle = spawn_fake(move |cmd| match cmd {
            GuildCommand::QueueList { respond } => {
                let _ = respond.send(Ok(QueueSnapshot {
                    current_meta: None,
                    queue: Vec::new(),
                }));
            }
            GuildCommand::HistoryList { respond } => {
                let _ = respond.send(Ok(Vec::new()));
            }
            GuildCommand::NowPlaying { respond } => {
                let _ = respond.send(Ok(None));
            }
            _ => panic!("expected a queue read"),
        });

        let snapshot = handle.queue_snapshot().await.expect("list should succeed");
        assert!(snapshot.queue.is_empty());
        assert!(snapshot.current_meta.is_none());
        assert!(
            handle
                .history_list()
                .await
                .expect("history should succeed")
                .is_empty()
        );
        assert!(
            handle
                .now_playing()
                .await
                .expect("now playing should succeed")
                .is_none()
        );
    }

    #[tokio::test]
    async fn queue_mutations_forward_positions() {
        let handle = spawn_fake(move |cmd| match cmd {
            GuildCommand::QueueClear { respond } => {
                let _ = respond.send(Ok(5));
            }
            GuildCommand::QueueRemove { position, respond } => {
                assert_eq!(position, 3);
                let _ = respond.send(Ok(QueuedTrack {
                    query: "removed".to_string(),
                    metadata: songbird::input::AuxMetadata::default(),
                    requested_by: Requester {
                        id: UserId::new(9),
                        name: Arc::from("dj"),
                    },
                }));
            }
            GuildCommand::QueueShuffle { respond } => {
                let _ = respond.send(Ok(4));
            }
            GuildCommand::QueueJump { position, respond } => {
                assert_eq!(position, 2);
                let _ = respond.send(Ok(track_info()));
            }
            GuildCommand::HistoryJump { position, respond } => {
                assert_eq!(position, 1);
                let _ = respond.send(Ok(track_info()));
            }
            _ => panic!("expected a queue mutation"),
        });

        assert_eq!(handle.queue_clear().await.expect("clear should succeed"), 5);
        let removed = handle.queue_remove(3).await.expect("remove should succeed");
        assert_eq!(removed.query, "removed");
        assert_eq!(
            handle
                .queue_shuffle()
                .await
                .expect("shuffle should succeed"),
            4
        );
        handle.queue_jump(2).await.expect("jump should succeed");
        handle
            .history_jump(1)
            .await
            .expect("history jump should succeed");
    }

    #[tokio::test]
    async fn seek_forwards_input_verbatim() {
        let (probe_tx, probe_rx) = oneshot::channel();
        let mut probe_tx = Some(probe_tx);
        let handle = spawn_fake(move |cmd| match cmd {
            GuildCommand::Seek { input, respond } => {
                let _ = probe_tx.take().expect("seek sent twice").send(input);
                let _ = respond.send(Ok(Duration::from_secs(90)));
            }
            _ => panic!("expected Seek"),
        });

        let pos = handle.seek("+30").await.expect("seek should succeed");
        assert_eq!(pos, Duration::from_secs(90));
        assert_eq!(probe_rx.await.expect("probe should fire"), "+30");
    }

    #[tokio::test]
    async fn go_to_channel_forwards_channel() {
        let handle = spawn_fake(move |cmd| match cmd {
            GuildCommand::GoToChannel {
                vc_channel_id,
                respond,
            } => {
                assert_eq!(vc_channel_id, ChannelId::new(55));
                let _ = respond.send(Ok(()));
            }
            _ => panic!("expected GoToChannel"),
        });

        handle
            .go_to_channel(ChannelId::new(55))
            .await
            .expect("go to channel should succeed");
    }

    #[tokio::test]
    async fn actor_failure_passes_through_unchanged() {
        let handle = spawn_fake(move |cmd| match cmd {
            GuildCommand::Pause { respond } => {
                let _ = respond.send(Err(anyhow::anyhow!("nothing is playing")));
            }
            _ => panic!("expected Pause"),
        });

        let err = handle
            .pause()
            .await
            .expect_err("actor failure should surface");
        assert!(err.to_string().contains("nothing is playing"));
    }

    #[tokio::test]
    async fn closed_mailbox_errors_instead_of_hanging() {
        let (tx, rx) = mpsc::channel::<GuildCommand>(1);
        drop(rx);
        let handle = PlaybackHandle::new(tx);

        let err = handle
            .pause()
            .await
            .expect_err("closed mailbox should fail");
        assert!(err.to_string().contains("mailbox closed"));
    }

    #[tokio::test]
    async fn dropped_reply_errors_instead_of_hanging() {
        let handle = spawn_fake(move |cmd| match cmd {
            GuildCommand::Pause { .. } => {
                // Actor dies without answering.
            }
            _ => panic!("expected Pause"),
        });

        let err = handle.pause().await.expect_err("dropped reply should fail");
        assert!(err.to_string().contains("dropped the reply"));
    }

    #[tokio::test]
    async fn handle_clone_shares_one_mailbox() {
        let (handle, join) = spawn_fake_tracked(move |cmd| match cmd {
            GuildCommand::Pause { respond } => {
                let _ = respond.send(Ok(()));
            }
            _ => panic!("expected Pause"),
        });

        handle
            .clone()
            .pause()
            .await
            .expect("clone should reach the same actor");
        drop(handle);
        join.await
            .expect("fake actor should exit once all handles drop");
    }
}
