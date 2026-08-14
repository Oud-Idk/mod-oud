#![allow(missing_docs)]
use crate::constants::BRAND_COLOR;
use crate::core::config::state::Context;
use crate::features::music::actor::GuildCommand;
use crate::features::music::player::format_duration;
use crate::features::music::state::{PlayOutcome, QueueAddOutcome, StartedTrackInfo};
use crate::shared::pagination::paginate;
use crate::shared::voice_state::get_user_vc_in_guild;
use anyhow::{Context as _, Result};
use poise::CreateReply;
use serenity::all::{ChannelId, CreateEmbed, CreateEmbedAuthor, CreateEmbedFooter, User};
use std::time::Duration;
use tokio::sync::mpsc::Sender;
use tokio::sync::oneshot;
use tracing::debug;

async fn reply(ctx: &Context<'_>, message: impl Into<String>) -> Result<()> {
    ctx.send(CreateReply::default().content(message)).await?;
    Ok(())
}

pub struct PreparedCommand<T = Result<StartedTrackInfo>> {
    pub actor_tx: Sender<GuildCommand>,
    pub vc_channel_id: Option<ChannelId>,
    pub track_tx: oneshot::Sender<T>,
    pub track_rx: oneshot::Receiver<T>,
}

impl<T> PreparedCommand<Result<T>> {
    /// Dispatches a command to the music actor and waits for the track result.
    /// Deduplicates the `actor_tx.send()` + `track_rx.await??` boilerplate!
    pub async fn dispatch(
        self,
        make_cmd: impl FnOnce(oneshot::Sender<Result<T>>) -> GuildCommand,
    ) -> Result<T> {
        self.actor_tx.send(make_cmd(self.track_tx)).await?;
        self.track_rx.await?
    }
}

async fn prepare_command<T>(ctx: &Context<'_>, require_vc: bool) -> Result<Option<PreparedCommand<T>>> {
    ctx.defer().await?;
    let Some(guild_id) = ctx.guild_id() else { return Ok(None) };

    let manager = songbird::get(ctx.serenity_context())
        .await
        .context("Failed to get song manager")?;
    let reqwest_client = ctx.data().core.reqwest_client.clone();

    let actor_tx = ctx.data().music_state
        .get_or_spawn_actor(guild_id, manager, reqwest_client)
        .await;

    let vc_channel_id = if require_vc {
        if let Some(channel_id) = get_user_vc_in_guild(ctx.data(), guild_id, ctx.author().id).await? { Some(channel_id) } else {
            reply(ctx, "You are not in any voice channels!").await?;
            return Ok(None);
        }
    } else {
        None
    };

    let (track_tx, track_rx) = oneshot::channel();

    Ok(Some(PreparedCommand {
        actor_tx,
        vc_channel_id,
        track_tx,
        track_rx,
    }))
}

fn track_embed(author: &User, title: String, thumbnail: Option<String>) -> CreateEmbed {
    CreateEmbed::new()
        .author(CreateEmbedAuthor::new(&author.name).icon_url(author.face()))
        .title(title)
        .thumbnail(thumbnail.unwrap_or_default())
        .color(BRAND_COLOR)
}

/// Music commands
// Parent command
#[poise::command(
    slash_command,
    guild_only,
    subcommands(
        "play",
        "prev", "pause", "resume", "next",
        "stop", "seek", "restart",
        "nowplaying",
        "go_to_channel",
        "queue",
        "history",
    )
)]
pub async fn music(ctx: Context<'_>) -> Result<()> {
    debug!(author = %ctx.author().name, "Parent /music command invoked");
    Ok(())
}

#[poise::command(slash_command, guild_only, subcommands(
    "add", "list", "clear", "remove", "shuffle", "goto"
))]
pub async fn queue(ctx: Context<'_>) -> Result<()> {
    debug!(author = %ctx.author().name, "Subcommand group /music queue invoked");
    Ok(())
}

#[poise::command(slash_command, guild_only, subcommands(
    "history_list", "history_goto"
))]
pub async fn history(ctx: Context<'_>) -> Result<()> {
    debug!(author = %ctx.author().name, "Subcommand group /music history invoked");
    Ok(())
}


/// Instantly overrides the currently playing song without clearing the queue.
#[poise::command(slash_command, guild_only)]
pub async fn play(
    ctx: Context<'_>,
    #[description = "YouTube/Spotify URL or search query"] query: String,
) -> Result<()> {
    let Some(p) = prepare_command(&ctx, true).await? else { return Ok(()) };
    let vc_channel_id = p.vc_channel_id.context("No voice channel available")?;

    let outcome = p.dispatch(|respond| GuildCommand::Play {
        query,
        vc_channel_id,
        requested_by_name: ctx.author().name.clone(),
        requested_by_id: ctx.author().id.get(),
        respond,
    }).await?;

    match outcome {
        PlayOutcome::Single(info) => {
            ctx.send(CreateReply::default().embed(track_embed(
                ctx.author(),
                format!("Playing {}", info.title),
                info.thumbnail,
            ))).await?;
        }
        PlayOutcome::Playlist { first_track, count } => {
            ctx.send(CreateReply::default().embed(track_embed(
                ctx.author(),
                format!("Playing {} (and queued {} remaining playlist tracks)", first_track.title, count - 1),
                first_track.thumbnail,
            ))).await?;
        }
    }


    Ok(())
}

/// Moves the bot to a different voice channel (joins if it isn't connected).
#[poise::command(slash_command, guild_only)]
pub async fn go_to_channel(
    ctx: Context<'_>,
    #[description = "The voice channel to move the bot to"]
    #[channel_types("Voice")]
    channel: serenity::all::GuildChannel,
) -> Result<()> {
    let Some(p) = prepare_command(&ctx, false).await? else { return Ok(()) };

    p.dispatch(|respond| GuildCommand::GoToChannel {
        vc_channel_id: channel.id,
        respond,
    }).await?;

    reply(&ctx, format!("Moved the music bot to **{}**.", channel.name)).await?;

    Ok(())
}

/// Restarts the currently playing track from the beginning.
#[poise::command(slash_command, guild_only)]
pub async fn restart(ctx: Context<'_>) -> Result<()> {
    let Some(p) = prepare_command(&ctx, true).await? else { return Ok(()) };

    let info = p.dispatch(|respond| GuildCommand::Restart { respond }).await?;
    reply(&ctx, format!("Restarted **{}** from the beginning.", info.title)).await?;

    Ok(())
}

/// Stops the current player and leaves
#[poise::command(slash_command, guild_only)]
pub async fn stop(ctx: Context<'_>) -> Result<()> {
    let Some(p) = prepare_command(&ctx, true).await? else { return Ok(()) };

    p.dispatch(|respond| GuildCommand::Stop { respond }).await?;
    reply(&ctx, "Stopped current track.").await?;

    Ok(())
}

/// Pauses the current track
#[poise::command(slash_command, guild_only)]
pub async fn pause(ctx: Context<'_>) -> Result<()> {
    let Some(p) = prepare_command(&ctx, true).await? else { return Ok(()) };

    p.dispatch(|respond| GuildCommand::Pause { respond }).await?;
    reply(&ctx, "Paused current track.").await?;

    Ok(())
}

/// Resumes playback
#[poise::command(slash_command, guild_only)]
pub async fn resume(ctx: Context<'_>) -> Result<()> {
    let Some(p) = prepare_command(&ctx, true).await? else { return Ok(()) };

    p.dispatch(|respond| GuildCommand::Resume { respond }).await?;
    reply(&ctx, "Resumed current track.").await?;

    Ok(())
}

/// Seeks song around
#[poise::command(slash_command, guild_only)]
pub async fn seek(
    ctx: Context<'_>,
    #[description = "Time in MM:SS or offset in +N"] time: String,
) -> Result<()> {
    let Some(p) = prepare_command(&ctx, true).await? else { return Ok(()) };

    let duration = p.dispatch(|respond| GuildCommand::Seek { input: time, respond }).await?;
    reply(&ctx, format!("Seeked current track to {}.", format_duration(Some(duration)))).await?;

    Ok(())
}

/// Skips the current track and plays the next one in the queue.
#[poise::command(slash_command, guild_only)]
pub async fn next(ctx: Context<'_>) -> Result<()> {
    let Some(p) = prepare_command(&ctx, true).await? else { return Ok(()) };

    let next_title = p.dispatch(|respond| GuildCommand::Skip { respond }).await?;

    match next_title {
        Some(title) => reply(&ctx, format!("Skipped. Now playing **{title}**.")).await?,
        None => reply(&ctx, "Skipped. Queue is empty, nothing left to play.").await?,
    }

    Ok(())
}


fn make_progress_bar(position_sec: f64, duration_sec: Option<u64>) -> String {
    let Some(total) = duration_sec.filter(|&d| d > 0) else {
        return "🔴 Live Stream".to_string();
    };

    let progress = (position_sec / total as f64).clamp(0.0, 1.0);
    let total_blocks = 14;
    let filled_blocks = (progress * total_blocks as f64).round() as usize;

    let mut bar = String::from("`");
    for i in 0..total_blocks {
        if i == filled_blocks {
            bar.push('🔘');
        } else {
            bar.push('▬');
        }
    }
    bar.push('`');
    bar
}

/// Shows the currently playing track.
#[poise::command(slash_command, guild_only)]
pub async fn nowplaying(ctx: Context<'_>) -> Result<()> {
    let Some(p) = prepare_command(&ctx, false).await? else { return Ok(()) };

    let res = p.dispatch(|respond| GuildCommand::NowPlaying { respond }).await?;

    match res {
        Some(np) => {
            let track = np.track;
            let title = track.metadata.title.as_deref().unwrap_or("Untitled").to_string();
            let duration_fmt = format_duration(track.metadata.duration);
            let position_fmt = format_duration(Some(Duration::from_secs_f64(np.position_sec)));
            let duration_secs = track.metadata.duration.map(|d| d.as_secs());

            let title_fmt = match &track.metadata.source_url {
                Some(url) if url != "#" => format!("[{title}]({url})"),
                _ => format!("**{title}**"),
            };

            let status_str = if np.is_paused { "⏸️ Paused" } else { "▶️ Playing" };
            let bar = make_progress_bar(np.position_sec, duration_secs);

            let description = format!(
                "{}\n\n{}\n`{} / {}` | {}\nRequested by **{}**",
                title_fmt, bar, position_fmt, duration_fmt, status_str, track.requested_by
            );

            ctx.send(CreateReply::default().embed(
                CreateEmbed::new()
                    .author(CreateEmbedAuthor::new(&ctx.author().name).icon_url(ctx.author().face()))
                    .title("Now Playing")
                    .description(description)
                    .thumbnail(track.metadata.thumbnail.unwrap_or_default())
                    .color(BRAND_COLOR),
            )).await?;
        }
        None => {
            reply(&ctx, "Nothing is currently playing.").await?;
        }
    }

    Ok(())
}

/// Goes back to the previously played track.
#[poise::command(slash_command, guild_only)]
pub async fn prev(ctx: Context<'_>) -> Result<()> {
    let Some(p) = prepare_command(&ctx, true).await? else { return Ok(()) };
    let vc_channel_id = p.vc_channel_id.context("No voice channel available")?;

    let info = p.dispatch(|respond| GuildCommand::Prev { vc_channel_id, respond }).await?;
    reply(&ctx, format!("Playing previous track: **{}**.", info.title)).await?;

    Ok(())
}

/// Adds a track to the queue, playing it immediately if nothing is active.
#[poise::command(slash_command, guild_only)]
pub async fn add(
    ctx: Context<'_>,
    #[description = "YouTube/Spotify URL or search query"] query: String,
) -> Result<()> {
    let Some(p) = prepare_command(&ctx, true).await? else { return Ok(()) };
    let vc_channel_id = p.vc_channel_id.context("No voice channel available")?;

    let outcome = p.dispatch(|respond| GuildCommand::QueueAdd {
        query,
        vc_channel_id,
        requested_by: ctx.author().clone(),
        respond,
    }).await?;

    match outcome {
        QueueAddOutcome::Played(info) => {
            ctx.send(CreateReply::default().embed(track_embed(
                ctx.author(),
                format!("Playing {}", info.title),
                info.thumbnail,
            ))).await?;
        }
        QueueAddOutcome::Queued(info) => {
            ctx.send(CreateReply::default().embed(track_embed(
                ctx.author(),
                format!("Queued {}", info.title),
                info.thumbnail,
            ))).await?;
        }
        QueueAddOutcome::PlaylistQueued { count, first_track } => {
            ctx.send(CreateReply::default().embed(track_embed(
                ctx.author(),
                format!("Queued {count} tracks from Spotify Playlist!"),
                first_track.thumbnail,
            ))).await?;
        }
    }

    Ok(())
}

/// Lists all currently queued tracks with interactive pagination buttons!
#[poise::command(slash_command, guild_only)]
pub async fn list(ctx: Context<'_>) -> Result<()> {
    let Some(p) = prepare_command(&ctx, false).await? else { return Ok(()) };

    let snapshot = p.dispatch(|respond| GuildCommand::QueueList { respond }).await?;

    if snapshot.current_meta.is_none() && snapshot.queue.is_empty() {
        reply(&ctx, "The queue is currently empty and nothing is playing.").await?;
        return Ok(());
    }

    let per_page = 10;
    let total_tracks = snapshot.queue.len();
    let total_pages = total_tracks.div_ceil(per_page).max(1);

    paginate(ctx, total_pages, move |page_idx| {
        let page = page_idx + 1; // 1-based page index for UI display
        let start_idx = page_idx * per_page;
        let end_idx = (start_idx + per_page).min(total_tracks);

        let mut description = String::new();

        if let Some(ref meta) = snapshot.current_meta {
            let title = meta.title.as_deref().unwrap_or("Untitled");
            let duration = format_duration(meta.duration);

            let title_fmt = match &meta.source_url {
                Some(url) if url != "#" => format!("[{title}]({url})"),
                _ => format!("**{title}**"),
            };

            description.push_str(&format!("**Now Playing:**\n{title_fmt} | `{duration}`\n\n"));
        }

        if snapshot.queue.is_empty() {
            description.push_str("**Up Next:**\nNo tracks in queue.");
        } else {
            description.push_str(&format!("**Up Next (Page {page}/{total_pages}):**\n"));
            for (i, track) in snapshot.queue[start_idx..end_idx].iter().enumerate() {
                let track_num = start_idx + i + 1;
                let title = track.metadata.title.as_deref().unwrap_or("Untitled");

                let title_fmt = match &track.metadata.source_url {
                    Some(url) if url != "#" => format!("[{title}]({url})"),
                    _ => format!("**{title}**"),
                };

                let duration_fmt = match track.metadata.duration {
                    Some(_) => format!(" | `{}`", format_duration(track.metadata.duration)),
                    None => String::new(),
                };

                description.push_str(&format!(
                    "{}. {}{} (Requested by **{}**)\n",
                    track_num, title_fmt, duration_fmt, track.requested_by
                ));
            }
        }

        CreateEmbed::new()
            .title("Music Queue")
            .description(description)
            .color(BRAND_COLOR)
            .footer(CreateEmbedFooter::new(format!(
                "Total queued tracks: {total_tracks} | Page {page}/{total_pages}"
            )))
    }).await?;

    Ok(())
}

/// Clears all tracks from the queue.
#[poise::command(slash_command, guild_only)]
pub async fn clear(ctx: Context<'_>) -> Result<()> {
    let Some(p) = prepare_command(&ctx, false).await? else { return Ok(()) };

    let count = p.dispatch(|respond| GuildCommand::QueueClear { respond }).await?;

    if count == 0 {
        reply(&ctx, "The queue is already empty.").await?;
    } else {
        reply(&ctx, format!("Cleared **{count}** tracks from the queue.")).await?;
    }

    Ok(())
}

/// Removes a track at a specific position from the queue.
#[poise::command(slash_command, guild_only)]
pub async fn remove(
    ctx: Context<'_>,
    #[description = "Track position in queue to remove (1-based index)"] position: usize,
) -> Result<()> {
    let Some(p) = prepare_command(&ctx, false).await? else { return Ok(()) };

    let removed = p.dispatch(|respond| GuildCommand::QueueRemove { position, respond }).await?;
    let title = removed.metadata.title.as_deref().unwrap_or("untitled").to_string();

    reply(&ctx, format!("Removed **{title}** from the queue.")).await?;
    Ok(())
}

/// Shuffles the order of all queued tracks (the current track is untouched).
#[poise::command(slash_command, guild_only)]
pub async fn shuffle(ctx: Context<'_>) -> Result<()> {
    let Some(p) = prepare_command(&ctx, false).await? else { return Ok(()) };

    let count = p.dispatch(|respond| GuildCommand::QueueShuffle { respond }).await?;

    if count == 0 {
        reply(&ctx, "The queue is empty, there's nothing to shuffle.").await?;
    } else {
        reply(&ctx, format!("Shuffled **{count}** tracks in the queue.")).await?;
    }

    Ok(())
}

/// Jumps to a track at a specific position in the queue and plays it now.
#[poise::command(slash_command, guild_only)]
pub async fn goto(
    ctx: Context<'_>,
    #[description = "Track position in queue to play (1-based index)"] position: usize,
) -> Result<()> {
    let Some(p) = prepare_command(&ctx, true).await? else { return Ok(()) };

    let info = p.dispatch(|respond| GuildCommand::QueueJump { position, respond }).await?;
    reply(&ctx, format!("Jumped to **{}**.", info.title)).await?;

    Ok(())
}

/// Lists previously played tracks, most recent first.
#[poise::command(slash_command, guild_only, rename = "list")]
pub async fn history_list(ctx: Context<'_>) -> Result<()> {
    let Some(p) = prepare_command(&ctx, false).await? else { return Ok(()) };

    let snapshot = p.dispatch(|respond| GuildCommand::HistoryList { respond }).await?;

    if snapshot.is_empty() {
        reply(&ctx, "No tracks in the play history yet.").await?;
        return Ok(());
    }

    let per_page = 10;
    let total_tracks = snapshot.len();
    let total_pages = total_tracks.div_ceil(per_page).max(1);

    paginate(ctx, total_pages, move |page_idx| {
        let page = page_idx + 1;
        let start_idx = page_idx * per_page;
        let end_idx = (start_idx + per_page).min(total_tracks);

        let mut description = String::new();
        for (i, track) in snapshot[start_idx..end_idx].iter().enumerate() {
            let track_num = start_idx + i + 1;
            let title = track.metadata.title.as_deref().unwrap_or("Untitled");

            let title_fmt = match &track.metadata.source_url {
                Some(url) if url != "#" => format!("[{title}]({url})"),
                _ => format!("**{title}**"),
            };

            let duration_fmt = match track.metadata.duration {
                Some(_) => format!(" | `{}`", format_duration(track.metadata.duration)),
                None => String::new(),
            };

            description.push_str(&format!("{track_num}. {title_fmt}{duration_fmt}\n"));
        }

        CreateEmbed::new()
            .title("Play History")
            .description(description)
            .color(BRAND_COLOR)
            .footer(CreateEmbedFooter::new(format!(
                "Most recent first | Page {page}/{total_pages}"
            )))
    }).await?;

    Ok(())
}

/// Replays a track from the play history (index 1 = most recently played).
#[poise::command(slash_command, guild_only, rename = "goto")]
pub async fn history_goto(
    ctx: Context<'_>,
    #[description = "Track position in history to play (1 = most recently played)"] position: usize,
) -> Result<()> {
    let Some(p) = prepare_command(&ctx, true).await? else { return Ok(()) };

    let info = p.dispatch(|respond| GuildCommand::HistoryJump { position, respond }).await?;
    reply(&ctx, format!("Replaying **{}**.", info.title)).await?;

    Ok(())
}
