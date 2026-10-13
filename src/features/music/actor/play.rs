use super::disconnect::DriverDisconnectHandler;
use super::resolve::{build_query_url, resolve_any_playlist};
use super::{GuildActor, Requester};
use crate::features::music::player::{
    OldTrackDisposition, fetch_metadata, install_new_track, prepare_and_play,
};
use crate::features::music::state::{PlayOutcome, QueueAddOutcome, QueuedTrack, StartedTrackInfo};
use crate::features::music::stats::record_track_start;
use anyhow::{Context, Result, bail};
use core::time::Duration;
use serenity::all::ChannelId;
use songbird::CoreEvent;
use songbird::events::Event;
use songbird::input::AuxMetadata;
use std::vec::IntoIter;
use tokio::time::Instant;

impl GuildActor {
    pub(super) async fn handle_play(
        &mut self,
        query: String,
        vc_channel_id: ChannelId,
        requested_by: Requester,
    ) -> Result<PlayOutcome> {
        self.retry_count = 0;
        if let Some(search_terms) = resolve_any_playlist(
            &self.reqwest_client,
            &self.spotify_auth,
            &query,
            &self.youtube_api_key,
        )
        .await
        {
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
                    &requested_by,
                    None,
                    OldTrackDisposition::History,
                )
                .await?;

            self.populate_queue(&requested_by, &mut terms_iter);

            return Ok(PlayOutcome::Playlist {
                first_track,
                count: total_tracks,
            });
        }

        let query_url = build_query_url(
            &self.reqwest_client,
            &self.spotify_auth,
            &query,
            &self.youtube_api_key,
        )
        .await;

        let first_track = self
            .start_playback(
                Some(vc_channel_id),
                query_url,
                &requested_by,
                None,
                OldTrackDisposition::History,
            )
            .await?;

        Ok(PlayOutcome::Single(first_track))
    }

    pub(super) async fn handle_queue_add(
        &mut self,
        query: String,
        vc_channel_id: ChannelId,
        requested_by: Requester,
    ) -> Result<QueueAddOutcome> {
        if let Some(search_terms) = resolve_any_playlist(
            &self.reqwest_client,
            &self.spotify_auth,
            &query,
            &self.youtube_api_key,
        )
        .await
        {
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
                requested_by: requested_by.clone(),
            };

            let first_track_info = StartedTrackInfo { title, thumbnail };

            if self.state.current.is_none() {
                // Play song #1 immediately!
                self.start_playback(
                    Some(vc_channel_id),
                    first_queued.query,
                    &first_queued.requested_by,
                    Some(first_queued.metadata),
                    OldTrackDisposition::History,
                )
                .await?;
            } else {
                // If something is already playing, push song #1 to queue
                self.state.queue.push_back(first_queued);
            }

            self.populate_queue(&requested_by, &mut terms_iter);

            return Ok(QueueAddOutcome::PlaylistQueued {
                count: total_tracks,
                first_track: first_track_info,
            });
        }

        let query_url = build_query_url(
            &self.reqwest_client,
            &self.spotify_auth,
            &query,
            &self.youtube_api_key,
        )
        .await;
        let metadata = fetch_metadata(self.services(), &query_url).await?;

        let title = metadata.title.as_deref().unwrap_or("untitled").to_string();
        let thumbnail = metadata.thumbnail.clone();
        let queued = QueuedTrack {
            query,
            metadata,
            requested_by: requested_by.clone(),
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
                    &queued.requested_by,
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

    fn populate_queue(&mut self, requested_by: &Requester, terms_iter: &mut IntoIter<String>) {
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
            });
        }
    }

    pub(super) async fn start_playback(
        &mut self,
        vc_channel_id: Option<ChannelId>,
        query: String,
        requested_by: &Requester,
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

        let started =
            prepare_and_play(self.services(), &call, query, requested_by, cached_meta).await?;

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
                requested_by,
                handle_uuid,
                meta,
            );
        }

        self.broadcast_state().await;

        Ok(StartedTrackInfo { title, thumbnail })
    }
}
