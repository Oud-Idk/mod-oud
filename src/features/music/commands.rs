use std::time::Duration;
use songbird::Event;
use songbird::TrackEvent;
use crate::Context;
use crate::shared::messages::send_ephemeral;
use anyhow::{bail, Context as _, Result};
use poise::CreateReply;
use serenity::all::{CreateEmbed, CreateEmbedAuthor, CreateEmbedFooter};
use songbird::input::{Compose, Input, YoutubeDl};
use tracing::debug;
use crate::features::music::events::TrackEndHandler;
use crate::features::music::state::QueuedTrack;
use crate::shared::voice_state::get_user_vc_in_guild;

const BRAND_COLOR: u32 = 0x4076f5;

fn format_duration(duration: Option<Duration>) -> String {
    match duration {
        Some(d) => {
            let total_secs = d.as_secs();
            let hours = total_secs / 3600;
            let mins = (total_secs % 3600) / 60;
            let secs = total_secs % 60;
            if hours > 0 {
                format!("{:02}:{:02}:{:02}", hours, mins, secs)
            } else {
                format!("{:02}:{:02}", mins, secs)
            }
        }
        None => "Unknown".to_string(),
    }
}

async fn resolve_spotify_url(client: &reqwest::Client, url: &str) -> Option<String> {
    if url.contains("open.spotify.com/") || url.contains("spotify:") {
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
                return Some(search_term);
            }
        }
    }
    None
}

async fn build_query_url(client: &reqwest::Client, query: &str) -> String {
    if let Some(spotify_query) = resolve_spotify_url(client, query).await {
        return spotify_query;
    }

    if query.starts_with("http://") || query.starts_with("https://") {
        query.to_string()
    } else {
        format!("ytsearch:{}", query)
    }
}

// Parent command
#[poise::command(slash_command, guild_only, subcommands(
    "play", "skip", "prev", "restart", "stop", "pause", "resume", "queue"
))]
pub async fn music(_ctx: Context<'_>) -> Result<()> { Ok(()) }

// Subcommand group: /music queue <add|list|clear|remove>
#[poise::command(slash_command, guild_only, subcommands(
    "add", "list", "clear", "remove"
))]
pub async fn queue(_ctx: Context<'_>) -> Result<()> { Ok(()) }

/// Instantly overrides the currently playing song without clearing the queue.
#[poise::command(slash_command, guild_only)]
pub async fn play(
    ctx: Context<'_>,
    #[description = "YouTube/Spotify URL or search query"] query: String
) -> Result<()> {
    ctx.defer().await?;
    let reqwest_client = ctx.data().reqwest_client.clone();
    let music_state = ctx.data().music_state.clone();
    let Some(guild_id) = ctx.guild_id() else { return Ok(()) };
    let Some(manager) = songbird::get(ctx.serenity_context()).await else {
        bail!("Cannot get songbird manager!");
    };
    let Some(vc_channel_id) = get_user_vc_in_guild(&ctx.data(), guild_id, ctx.author().id).await? else {
        send_ephemeral(&ctx, "You are not in any voice channels!").await?;
        return Ok(());
    };

    let claimed = music_state.with_guild(guild_id, |p| {
        if p.transitioning {
            false
        } else {
            p.transitioning = true;
            true
        }
    }).await;

    if !claimed {
        send_ephemeral(&ctx, "Already starting a track — try again in a moment.").await?;
        return Ok(());
    }

    let query_url = build_query_url(&reqwest_client, &query).await;
    debug!(query_url, "Resolving song query");

    let mut src = YoutubeDl::new(reqwest_client.clone(), query_url.clone());
    let metadata = match src.aux_metadata().await {
        Ok(m) => m,
        Err(e) => {
            music_state.with_guild(guild_id, |p| p.transitioning = false).await;
            return Err(e).context("Error fetching track metadata");
        }
    };

    let call_handler = match manager.join(guild_id, vc_channel_id).await {
        Ok(c) => c,
        Err(e) => {
            music_state.with_guild(guild_id, |p| p.transitioning = false).await;
            return Err(e).context("Failed to join voice channel");
        }
    };

    let new_track = QueuedTrack {
        query: query_url,
        metadata: metadata.clone(),
        requested_by: ctx.author().name.clone(),
    };

    let old_handle = music_state.with_guild(guild_id, |p| {
        if let Some(old_track) = p.current_track.take() {
            p.history.push(old_track);
        }
        p.current.take()
    }).await;

    let source: Input = src.into();
    let handle = {
        let mut handler = call_handler.lock().await;
        handler.play_input(source)
    };
    let handle_uuid = handle.uuid();

    let _ = handle.add_event(
        Event::Track(TrackEvent::End),
        TrackEndHandler {
            guild_id,
            expected_uuid: handle_uuid,
            call: call_handler.clone(),
            music_state: music_state.clone(),
            reqwest_client: reqwest_client.clone(),
        },
    );

    music_state.with_guild(guild_id, |p| {
        p.current = Some(handle);
        p.current_track = Some(new_track);
        p.current_meta = Some(metadata.clone());
        p.transitioning = false;
    }).await;

    if let Some(old) = old_handle {
        let _ = old.stop();
    }

    ctx.send(CreateReply::default().embed(CreateEmbed::new()
        .author(CreateEmbedAuthor::new(&ctx.author().name).icon_url(ctx.author().face()))
        .title(format!("Playing {}", metadata.title.unwrap_or("untitled".to_string())))
        .thumbnail(metadata.thumbnail.unwrap_or_default())
        .color(BRAND_COLOR)
    )).await?;
    Ok(())
}

/// Plays the previously played track from history.
#[poise::command(slash_command, guild_only)]
pub async fn prev(ctx: Context<'_>) -> Result<()> {
    ctx.defer().await?;
    let reqwest_client = ctx.data().reqwest_client.clone();
    let music_state = ctx.data().music_state.clone();
    let Some(guild_id) = ctx.guild_id() else { return Ok(()) };
    let Some(manager) = songbird::get(ctx.serenity_context()).await else {
        bail!("Cannot get songbird manager!");
    };
    let Some(vc_channel_id) = get_user_vc_in_guild(&ctx.data(), guild_id, ctx.author().id).await? else {
        send_ephemeral(&ctx, "You are not in any voice channels!").await?;
        return Ok(());
    };

    let prev_track = music_state.with_guild(guild_id, |p| p.history.pop()).await;

    let Some(prev_track) = prev_track else {
        send_ephemeral(&ctx, "No previous tracks in history.").await?;
        return Ok(());
    };

    let call_handler = match manager.join(guild_id, vc_channel_id).await {
        Ok(c) => c,
        Err(e) => return Err(e).context("Failed to join voice channel"),
    };

    // Push active track to queue front so it isn't lost
    let old_handle = music_state.with_guild(guild_id, |p| {
        if let Some(current_track) = p.current_track.take() {
            p.queue.push_front(current_track);
        }
        p.current.take()
    }).await;

    let mut src = YoutubeDl::new(reqwest_client.clone(), prev_track.query.clone());
    let metadata = match src.aux_metadata().await {
        Ok(m) => m,
        Err(_) => prev_track.metadata.clone(),
    };

    let source: Input = src.into();
    let handle = {
        let mut handler = call_handler.lock().await;
        handler.play_input(source)
    };
    let handle_uuid = handle.uuid();

    let _ = handle.add_event(
        Event::Track(TrackEvent::End),
        TrackEndHandler {
            guild_id,
            expected_uuid: handle_uuid,
            call: call_handler.clone(),
            music_state: music_state.clone(),
            reqwest_client: reqwest_client.clone(),
        },
    );

    music_state.with_guild(guild_id, |p| {
        p.current = Some(handle);
        p.current_track = Some(prev_track.clone());
        p.current_meta = Some(metadata.clone());
    }).await;

    if let Some(old) = old_handle {
        let _ = old.stop();
    }

    let title = metadata.title.unwrap_or_else(|| "untitled".to_string());
    send_ephemeral(&ctx, &format!("Playing previous track: **{}**.", title)).await?;
    Ok(())
}

/// Restarts the currently playing track from the beginning.
#[poise::command(slash_command, guild_only)]
pub async fn restart(ctx: Context<'_>) -> Result<()> {
    ctx.defer().await?;
    let reqwest_client = ctx.data().reqwest_client.clone();
    let music_state = ctx.data().music_state.clone();
    let Some(guild_id) = ctx.guild_id() else { return Ok(()) };
    let Some(manager) = songbird::get(ctx.serenity_context()).await else {
        bail!("Cannot get songbird manager!");
    };

    let (current_handle, current_track) = music_state.with_guild(guild_id, |p| {
        (p.current.clone(), p.current_track.clone())
    }).await;

    let (Some(handle), Some(track)) = (current_handle, current_track) else {
        send_ephemeral(&ctx, "Nothing is currently playing.").await?;
        return Ok(());
    };

    // Try seeking using Songbird's `seek_async` method
    if handle.seek_async(Duration::ZERO).await.is_ok() {
        send_ephemeral(&ctx, "Restarted track from the beginning.").await?;
        return Ok(());
    }

    // Fallback: re-stream from 00:00 if seeking is unsupported by the live stream input
    let Some(vc_channel_id) = get_user_vc_in_guild(&ctx.data(), guild_id, ctx.author().id).await? else {
        send_ephemeral(&ctx, "You are not in any voice channels!").await?;
        return Ok(());
    };

    let call_handler = match manager.join(guild_id, vc_channel_id).await {
        Ok(c) => c,
        Err(e) => return Err(e).context("Failed to join voice channel"),
    };

    let old_handle = music_state.with_guild(guild_id, |p| p.current.take()).await;

    let mut src = YoutubeDl::new(reqwest_client.clone(), track.query.clone());
    let source: Input = src.into();
    let new_handle = {
        let mut handler = call_handler.lock().await;
        handler.play_input(source)
    };
    let handle_uuid = new_handle.uuid();

    let _ = new_handle.add_event(
        Event::Track(TrackEvent::End),
        TrackEndHandler {
            guild_id,
            expected_uuid: handle_uuid,
            call: call_handler.clone(),
            music_state: music_state.clone(),
            reqwest_client: reqwest_client.clone(),
        },
    );

    music_state.with_guild(guild_id, |p| {
        p.current = Some(new_handle);
    }).await;

    if let Some(old) = old_handle {
        let _ = old.stop();
    }

    let title = track.metadata.title.unwrap_or_else(|| "untitled".to_string());
    send_ephemeral(&ctx, &format!("Restarted **{}** from the beginning.", title)).await?;
    Ok(())
}

/// Adds a track to the queue (plays immediately if nothing is active).
#[poise::command(slash_command, guild_only)]
pub async fn add(
    ctx: Context<'_>,
    #[description = "YouTube/Spotify URL or search query"] query: String,
) -> Result<()> {
    ctx.defer().await?;
    let reqwest_client = ctx.data().reqwest_client.clone();
    let music_state = ctx.data().music_state.clone();
    let Some(guild_id) = ctx.guild_id() else { return Ok(()) };
    let Some(manager) = songbird::get(ctx.serenity_context()).await else {
        bail!("Cannot get songbird manager!");
    };
    let Some(vc_channel_id) = get_user_vc_in_guild(&ctx.data(), guild_id, ctx.author().id).await? else {
        send_ephemeral(&ctx, "You are not in any voice channels!").await?;
        return Ok(());
    };

    let claimed = music_state.with_guild(guild_id, |p| {
        if p.transitioning {
            false
        } else {
            p.transitioning = true;
            true
        }
    }).await;

    if !claimed {
        send_ephemeral(&ctx, "Already starting a track — try again in a moment.").await?;
        return Ok(());
    }

    let query_url = build_query_url(&reqwest_client, &query).await;
    debug!(query_url, "Resolving song query");

    let mut src = YoutubeDl::new(reqwest_client.clone(), query_url.clone());
    let metadata = match src.aux_metadata().await {
        Ok(m) => m,
        Err(e) => {
            music_state.with_guild(guild_id, |p| p.transitioning = false).await;
            return Err(e).context("Error fetching track metadata");
        }
    };

    let call_handler = match manager.join(guild_id, vc_channel_id).await {
        Ok(c) => c,
        Err(e) => {
            music_state.with_guild(guild_id, |p| p.transitioning = false).await;
            return Err(e).context("Failed to join voice channel");
        }
    };

    let new_track = QueuedTrack {
        query: query_url,
        metadata: metadata.clone(),
        requested_by: ctx.author().name.clone(),
    };

    let is_playing = music_state.with_guild(guild_id, |p| p.current.is_some()).await;

    if is_playing {
        let title = metadata.title.clone().unwrap_or_else(|| "untitled".to_string());
        music_state.with_guild(guild_id, |p| {
            p.queue.push_back(new_track);
            p.transitioning = false;
        }).await;

        ctx.send(CreateReply::default().embed(CreateEmbed::new()
            .author(CreateEmbedAuthor::new(&ctx.author().name).icon_url(ctx.author().face()))
            .title(format!("Queued {}", title))
            .thumbnail(metadata.thumbnail.unwrap_or_default())
            .color(BRAND_COLOR)
        )).await?;

        return Ok(());
    }

    // Nothing is playing: start playing immediately
    let source: Input = src.into();
    let handle = {
        let mut handler = call_handler.lock().await;
        handler.play_input(source)
    };
    let handle_uuid = handle.uuid();

    let _ = handle.add_event(
        Event::Track(TrackEvent::End),
        TrackEndHandler {
            guild_id,
            expected_uuid: handle_uuid,
            call: call_handler.clone(),
            music_state: music_state.clone(),
            reqwest_client: reqwest_client.clone(),
        },
    );

    music_state.with_guild(guild_id, |p| {
        p.current = Some(handle);
        p.current_track = Some(new_track);
        p.current_meta = Some(metadata.clone());
        p.transitioning = false;
    }).await;

    ctx.send(CreateReply::default().embed(CreateEmbed::new()
        .author(CreateEmbedAuthor::new(&ctx.author().name).icon_url(ctx.author().face()))
        .title(format!("Playing {}", metadata.title.unwrap_or("untitled".to_string())))
        .thumbnail(metadata.thumbnail.unwrap_or_default())
        .color(BRAND_COLOR)
    )).await?;

    Ok(())
}

/// Lists all currently queued tracks.
#[poise::command(slash_command, guild_only)]
pub async fn list(
    ctx: Context<'_>,
    #[description = "Page number to view"] page: Option<usize>,
) -> Result<()> {
    ctx.defer().await?;
    let Some(guild_id) = ctx.guild_id() else { return Ok(()) };
    let music_state = ctx.data().music_state.clone();

    let (current_meta, queue_snapshot) = music_state.with_guild(guild_id, |p| {
        (p.current_meta.clone(), p.queue.iter().cloned().collect::<Vec<_>>())
    }).await;

    if current_meta.is_none() && queue_snapshot.is_empty() {
        send_ephemeral(&ctx, "The queue is currently empty and nothing is playing.").await?;
        return Ok(());
    }

    let per_page = 10;
    let total_tracks = queue_snapshot.len();
    let total_pages = ((total_tracks as f64) / (per_page as f64)).ceil() as usize;
    let total_pages = total_pages.max(1);

    let page = page.unwrap_or(1).clamp(1, total_pages);
    let start_idx = (page - 1) * per_page;
    let end_idx = (start_idx + per_page).min(total_tracks);

    let mut description = String::new();

    if let Some(ref meta) = current_meta {
        let title = meta.title.as_deref().unwrap_or("Untitled");
        let duration = format_duration(meta.duration);
        let url = meta.source_url.as_deref().unwrap_or("#");
        description.push_str(&format!("**Now Playing:**\n[{}]({}) | `{}`\n\n", title, url, duration));
    }

    if queue_snapshot.is_empty() {
        description.push_str("**Up Next:**\nNo tracks in queue.");
    } else {
        description.push_str(&format!("**Up Next (Page {}/{}):**\n", page, total_pages));
        for (i, track) in queue_snapshot[start_idx..end_idx].iter().enumerate() {
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
    ctx.defer().await?;
    let Some(guild_id) = ctx.guild_id() else { return Ok(()) };
    let music_state = ctx.data().music_state.clone();

    let count = music_state.with_guild(guild_id, |p| {
        let len = p.queue.len();
        p.queue.clear();
        len
    }).await;

    if count == 0 {
        send_ephemeral(&ctx, "The queue is already empty.").await?;
    } else {
        send_ephemeral(&ctx, &format!("Cleared **{}** tracks from the queue.", count)).await?;
    }

    Ok(())
}

/// Removes a track at a specific index from the queue.
#[poise::command(slash_command, guild_only)]
pub async fn remove(
    ctx: Context<'_>,
    #[description = "Track position in queue to remove (1-based index)"] position: usize,
) -> Result<()> {
    ctx.defer().await?;
    let Some(guild_id) = ctx.guild_id() else { return Ok(()) };
    let music_state = ctx.data().music_state.clone();

    if position == 0 {
        send_ephemeral(&ctx, "Position must be 1 or greater.").await?;
        return Ok(());
    }

    let removed = music_state.with_guild(guild_id, |p| {
        if position <= p.queue.len() {
            p.queue.remove(position - 1)
        } else {
            None
        }
    }).await;

    match removed {
        Some(track) => {
            let title = track.metadata.title.unwrap_or_else(|| "untitled".to_string());
            send_ephemeral(&ctx, &format!("Removed **{}** from the queue.", title)).await?;
        }
        None => {
            send_ephemeral(&ctx, "Invalid position. Track not found in queue.").await?;
        }
    }

    Ok(())
}

#[poise::command(slash_command, guild_only)]
pub async fn skip(ctx: Context<'_>) -> Result<()> {
    ctx.defer().await?;
    let Some(guild_id) = ctx.guild_id() else { return Ok(()) };
    let music_state = ctx.data().music_state.clone();

    let handle = music_state.with_guild(guild_id, |p| p.current.clone()).await;
    let Some(handle) = handle else {
        send_ephemeral(&ctx, "Nothing is playing.").await?;
        return Ok(());
    };

    let next_title = music_state.with_guild(guild_id, |p| {
        p.queue.front().map(|t| t.metadata.title.clone().unwrap_or("untitled".to_string()))
    }).await;

    // Stopping fires TrackEvent::End, which advances the queue for us.
    handle.stop().context("Failed to skip track")?;

    match next_title {
        Some(title) => send_ephemeral(&ctx, &format!("Skipped. Now playing **{}**.", title)).await?,
        None => send_ephemeral(&ctx, "Skipped. Queue is empty, nothing left to play.").await?,
    };
    Ok(())
}

#[poise::command(slash_command, guild_only)]
pub async fn stop(ctx: Context<'_>) -> Result<()> {
    ctx.defer().await?;
    let Some(guild_id) = ctx.guild_id() else { return Ok(()) };
    let Some(manager) = songbird::get(ctx.serenity_context()).await else {
        bail!("Cannot get songbird manager!");
    };
    let music_state = ctx.data().music_state.clone();

    music_state.with_guild(guild_id, |p| {
        p.queue.clear();
        if let Some(finished) = p.current_track.take() {
            p.history.push(finished);
        }
        if let Some(handle) = p.current.take() {
            let _ = handle.stop();
        }
        p.current_meta = None;
    }).await;

    manager.remove(guild_id).await.context("Failed to leave voice channel")?;
    send_ephemeral(&ctx, "Stopped and left the voice channel.").await?;
    Ok(())
}

#[poise::command(slash_command, guild_only)]
pub async fn pause(ctx: Context<'_>) -> Result<()> {
    ctx.defer().await?;
    let Some(guild_id) = ctx.guild_id() else { return Ok(()) };
    let music_state = ctx.data().music_state.clone();

    let handle = music_state.with_guild(guild_id, |p| p.current.clone()).await;
    let Some(handle) = handle else {
        send_ephemeral(&ctx, "Nothing is playing.").await?;
        return Ok(());
    };
    handle.pause().context("Failed to pause")?;
    send_ephemeral(&ctx, "Paused.").await?;
    Ok(())
}

#[poise::command(slash_command, guild_only)]
pub async fn resume(ctx: Context<'_>) -> Result<()> {
    ctx.defer().await?;
    let Some(guild_id) = ctx.guild_id() else { return Ok(()) };
    let music_state = ctx.data().music_state.clone();

    let handle = music_state.with_guild(guild_id, |p| p.current.clone()).await;
    let Some(handle) = handle else {
        send_ephemeral(&ctx, "Nothing is playing.").await?;
        return Ok(());
    };
    handle.play().context("Failed to resume")?;
    send_ephemeral(&ctx, "Resumed.").await?;
    Ok(())
}