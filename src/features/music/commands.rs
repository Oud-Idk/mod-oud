use anyhow::{Context as _, Result};
use poise::CreateReply;
use serenity::all::{ChannelId, CreateEmbed, CreateEmbedAuthor, CreateEmbedFooter, User};
use tokio::sync::mpsc::Sender;
use tokio::sync::oneshot;
use tracing::debug;

use crate::core::config::state::Context;
use crate::features::music::actor::GuildCommand;
use crate::features::music::player::format_duration;
use crate::features::music::state::{QueueAddOutcome, StartedTrackInfo};
use crate::shared::voice_state::get_user_vc_in_guild;

const BRAND_COLOR: u32 = 0x4076f5;

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
        Ok(self.track_rx.await??)
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
        match get_user_vc_in_guild(ctx.data(), guild_id, ctx.author().id).await? {
            Some(channel_id) => Some(channel_id),
            None => {
                reply(ctx, "You are not in any voice channels!").await?;
                return Ok(None);
            }
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

// Parent command
#[poise::command(
    slash_command,
    guild_only,
    subcommands(
        "play",
        "prev", "pause", "resume", "next",
        "stop", "seek", "restart",
        "queue",
    )
)]
pub async fn music(ctx: Context<'_>) -> Result<()> {
    debug!(author = %ctx.author().name, "Parent /music command invoked");
    Ok(())
}

#[poise::command(slash_command, guild_only, subcommands(
    "add", "list", "clear", "remove"
))]
pub async fn queue(ctx: Context<'_>) -> Result<()> {
    debug!(author = %ctx.author().name, "Subcommand group /music queue invoked");
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

    let info = p.dispatch(|respond| GuildCommand::Play {
        query,
        vc_channel_id,
        requested_by: ctx.author().clone(),
        respond,
    }).await?;

    ctx.send(CreateReply::default().embed(track_embed(
        ctx.author(),
        format!("Playing {}", info.title),
        info.thumbnail,
    ))).await?;

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
        Some(title) => reply(&ctx, format!("Skipped. Now playing **{}**.", title)).await?,
        None => reply(&ctx, "Skipped. Queue is empty, nothing left to play.").await?,
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
    }

    Ok(())
}

/// Lists all currently queued tracks.
#[poise::command(slash_command, guild_only)]
pub async fn list(
    ctx: Context<'_>,
    #[description = "Page number to view"] page: Option<usize>,
) -> Result<()> {
    let Some(p) = prepare_command(&ctx, false).await? else { return Ok(()) };

    let snapshot = p.dispatch(|respond| GuildCommand::QueueList { respond }).await?;

    if snapshot.current_meta.is_none() && snapshot.queue.is_empty() {
        reply(&ctx, "The queue is currently empty and nothing is playing.").await?;
        return Ok(());
    }

    let per_page = 10;
    let total_tracks = snapshot.queue.len();
    let total_pages = total_tracks.div_ceil(per_page).max(1);

    let page = page.unwrap_or(1).clamp(1, total_pages);
    let start_idx = (page - 1) * per_page;
    let end_idx = (start_idx + per_page).min(total_tracks);

    let mut description = String::new();

    if let Some(ref meta) = snapshot.current_meta {
        let title = meta.title.as_deref().unwrap_or("Untitled");
        let duration = format_duration(meta.duration);
        let url = meta.source_url.as_deref().unwrap_or("#");
        description.push_str(&format!("**Now Playing:**\n[{}]({}) | `{}`\n\n", title, url, duration));
    }

    if snapshot.queue.is_empty() {
        description.push_str("**Up Next:**\nNo tracks in queue.");
    } else {
        description.push_str(&format!("**Up Next (Page {}/{}):**\n", page, total_pages));
        for (i, track) in snapshot.queue[start_idx..end_idx].iter().enumerate() {
            let track_num = start_idx + i + 1;
            let title = track.metadata.title.as_deref().unwrap_or("Untitled");
            let duration = format_duration(track.metadata.duration);
            let url = track.metadata.source_url.as_deref().unwrap_or("#");
            description.push_str(&format!(
                "`{}.` [{}]({}) | `{}` (Requested by **{}**)\n",
                track_num, title, url, duration, track.requested_by
            ));
        }
    }

    let embed = CreateEmbed::new()
        .title("Music Queue")
        .description(description)
        .color(BRAND_COLOR)
        .footer(CreateEmbedFooter::new(format!(
            "Total queued tracks: {} | Page {}/{}",
            total_tracks, page, total_pages
        )));

    ctx.send(CreateReply::default().embed(embed)).await?;
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
        reply(&ctx, format!("Cleared **{}** tracks from the queue.", count)).await?;
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

    reply(&ctx, format!("Removed **{}** from the queue.", title)).await?;
    Ok(())
}
