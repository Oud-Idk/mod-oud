use std::time::Duration;
use songbird::Event;
use songbird::TrackEvent;
use crate::Context;
use crate::shared::messages::send_ephemeral;
use anyhow::{bail, Context as _, Result};
use poise::CreateReply;
use serenity::all::{CreateEmbed, CreateEmbedAuthor, CreateEmbedFooter};
use songbird::input::{Compose, Input, YoutubeDl};
use tracing::{debug, info, warn, error};
use crate::features::music::events::TrackEndHandler;
use crate::features::music::state::QueuedTrack;
use crate::shared::voice_state::get_user_vc_in_guild;

const BRAND_COLOR: u32 = 0x4076f5;

enum SeekMode {
    Absolute(Duration),
    RelativeForward(Duration),
    RelativeBackward(Duration),
}

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

fn parse_timestamp(input: &str) -> Option<Duration> {
    let input = input.trim();
    if let Ok(secs) = input.parse::<u64>() {
        return Some(Duration::from_secs(secs));
    }

    let parts: Vec<&str> = input.split(':').collect();
    match parts.as_slice() {
        [mins, secs] => {
            let m: u64 = mins.parse().ok()?;
            let s: u64 = secs.parse().ok()?;
            if s >= 60 { return None; }
            Some(Duration::from_secs(m * 60 + s))
        }
        [hours, mins, secs] => {
            let h: u64 = hours.parse().ok()?;
            let m: u64 = mins.parse().ok()?;
            let s: u64 = secs.parse().ok()?;
            if m >= 60 || s >= 60 { return None; }
            Some(Duration::from_secs(h * 3600 + m * 60 + s))
        }
        _ => None,
    }
}

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
                info!(url = %url, title = %title, author = %author, search_term = %search_term, "Resolved Spotify URL into YouTube search term");
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

// Parent command
#[poise::command(slash_command, guild_only, subcommands(
    "play", "skip", "prev", "restart", "stop", "pause", "resume", "queue", "seek"
))]
pub async fn music(ctx: Context<'_>) -> Result<()> {
    debug!(author = %ctx.author().name, "Parent /music command invoked");
    Ok(())
}

// Subcommand group: /music queue <add|list|clear|remove>
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
    #[description = "YouTube/Spotify URL or search query"] query: String
) -> Result<()> {
    info!(author = %ctx.author().name, query = %query, "Executing /music play command");
    ctx.defer().await?;

    let reqwest_client = ctx.data().reqwest_client.clone();
    let music_state = ctx.data().music_state.clone();
    let Some(guild_id) = ctx.guild_id() else {
        warn!("Command invoked outside of a guild");
        return Ok(());
    };
    let Some(manager) = songbird::get(ctx.serenity_context()).await else {
        error!("Failed to retrieve Songbird manager");
        bail!("Cannot get songbird manager!");
    };
    let Some(vc_channel_id) = get_user_vc_in_guild(&ctx.data(), guild_id, ctx.author().id).await? else {
        debug!(author = %ctx.author().name, guild_id = %guild_id, "User not in voice channel");
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
        debug!(guild_id = %guild_id, "Transition lock active; rejecting duplicate play command");
        send_ephemeral(&ctx, "Already starting a track — try again in a moment.").await?;
        return Ok(());
    }

    let query_url = build_query_url(&reqwest_client, &query).await;
    debug!(guild_id = %guild_id, query_url = %query_url, "Fetching metadata via YoutubeDl");

    let mut src = YoutubeDl::new(reqwest_client.clone(), query_url.clone());
    let metadata = match src.aux_metadata().await {
        Ok(m) => {
            debug!(guild_id = %guild_id, title = ?m.title, "Aux metadata successfully fetched");
            m
        }
        Err(e) => {
            error!(guild_id = %guild_id, error = ?e, "Error fetching track metadata");
            music_state.with_guild(guild_id, |p| p.transitioning = false).await;
            return Err(e).context("Error fetching track metadata");
        }
    };

    let call_handler = match manager.join(guild_id, vc_channel_id).await {
        Ok(c) => {
            debug!(guild_id = %guild_id, vc_channel_id = %vc_channel_id, "Joined voice channel");
            c
        }
        Err(e) => {
            error!(guild_id = %guild_id, vc_channel_id = %vc_channel_id, error = ?e, "Failed to join voice channel");
            music_state.with_guild(guild_id, |p| p.transitioning = false).await;
            return Err(e).context("Failed to join voice channel");
        }
    };

    // Use resolved canonical URL for faster subsequent seeks
    let resolved_query = metadata.source_url.clone().unwrap_or(query_url);
    let new_track = QueuedTrack {
        query: resolved_query,
        metadata: metadata.clone(),
        requested_by: ctx.author().name.clone(),
    };

    let old_handle = music_state.with_guild(guild_id, |p| {
        if let Some(old_track) = p.current_track.take() {
            debug!(guild_id = %guild_id, "Pushing active track to history");
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
    debug!(guild_id = %guild_id, uuid = %handle_uuid, "Started playing track input");

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
        debug!(guild_id = %guild_id, "Stopping previous track handle");
        let _ = old.stop();
    }

    let track_title = metadata.title.as_deref().unwrap_or("untitled");
    info!(guild_id = %guild_id, track_title = %track_title, "Now playing track");

    ctx.send(CreateReply::default().embed(CreateEmbed::new()
        .author(CreateEmbedAuthor::new(&ctx.author().name).icon_url(ctx.author().face()))
        .title(format!("Playing {}", track_title))
        .thumbnail(metadata.thumbnail.unwrap_or_default())
        .color(BRAND_COLOR)
    )).await?;

    Ok(())
}

/// Plays the previously played track from history.
#[poise::command(slash_command, guild_only)]
pub async fn prev(ctx: Context<'_>) -> Result<()> {
    info!(author = %ctx.author().name, "Executing /music prev command");
    ctx.defer().await?;

    let reqwest_client = ctx.data().reqwest_client.clone();
    let music_state = ctx.data().music_state.clone();
    let Some(guild_id) = ctx.guild_id() else { return Ok(()) };
    let Some(manager) = songbird::get(ctx.serenity_context()).await else {
        error!("Cannot get songbird manager!");
        bail!("Cannot get songbird manager!");
    };
    let Some(vc_channel_id) = get_user_vc_in_guild(&ctx.data(), guild_id, ctx.author().id).await? else {
        debug!(author = %ctx.author().name, guild_id = %guild_id, "User not in voice channel");
        send_ephemeral(&ctx, "You are not in any voice channels!").await?;
        return Ok(());
    };

    let prev_track = music_state.with_guild(guild_id, |p| p.history.pop()).await;

    let Some(prev_track) = prev_track else {
        debug!(guild_id = %guild_id, "No history found to play previous track");
        send_ephemeral(&ctx, "No previous tracks in history.").await?;
        return Ok(());
    };

    let call_handler = match manager.join(guild_id, vc_channel_id).await {
        Ok(c) => c,
        Err(e) => {
            error!(guild_id = %guild_id, error = ?e, "Failed to join voice channel for prev command");
            return Err(e).context("Failed to join voice channel");
        }
    };

    let old_handle = music_state.with_guild(guild_id, |p| {
        if let Some(current_track) = p.current_track.take() {
            debug!(guild_id = %guild_id, "Pushing current track back to front of queue");
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
    debug!(guild_id = %guild_id, uuid = %handle_uuid, "Started playing previous track");

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
    info!(guild_id = %guild_id, track_title = %title, "Playing previous track");
    send_ephemeral(&ctx, &format!("Playing previous track: **{}**.", title)).await?;
    Ok(())
}

/// Restarts the currently playing track from the beginning.
#[poise::command(slash_command, guild_only)]
pub async fn restart(ctx: Context<'_>) -> Result<()> {
    info!(author = %ctx.author().name, "Executing /music restart command");
    ctx.defer_ephemeral().await?;

    let reqwest_client = ctx.data().reqwest_client.clone();
    let music_state = ctx.data().music_state.clone();
    let Some(guild_id) = ctx.guild_id() else {
        warn!("Guild ID unavailable for /music restart");
        return Ok(());
    };

    let (current_handle, current_track) = music_state.with_guild(guild_id, |p| {
        (p.current.clone(), p.current_track.clone())
    }).await;

    let (Some(old_handle), Some(track)) = (current_handle, current_track) else {
        debug!(guild_id = %guild_id, "Restart command issued, but nothing is playing");
        send_ephemeral(&ctx, "Nothing is currently playing.").await?;
        return Ok(());
    };

    let title = track.metadata.title.clone().unwrap_or_else(|| "untitled".to_string());
    let Some(manager) = songbird::get(ctx.serenity_context()).await else {
        error!("Songbird manager unavailable");
        bail!("Cannot get songbird manager!");
    };

    // Reuse existing call handler to avoid VC re-connects
    let call_handler = match manager.get(guild_id) {
        Some(c) => c,
        None => {
            let Some(vc_channel_id) = get_user_vc_in_guild(&ctx.data(), guild_id, ctx.author().id).await? else {
                send_ephemeral(&ctx, "You are not in any voice channels!").await?;
                return Ok(());
            };
            match manager.join(guild_id, vc_channel_id).await {
                Ok(c) => c,
                Err(e) => {
                    error!(guild_id = %guild_id, error = ?e, "Failed to join VC during restart");
                    send_ephemeral(&ctx, "Failed to join voice channel.").await?;
                    return Err(e).context("Failed to join voice channel");
                }
            }
        }
    };

    // Direct stream swap (Instant <10ms restart)
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

    let _ = old_handle.stop();

    info!(guild_id = %guild_id, track_title = %title, "Restarted track via direct stream swap");
    send_ephemeral(&ctx, &format!("Restarted **{}** from the beginning.", title)).await?;

    Ok(())
}

/// Adds a track to the queue (plays immediately if nothing is active).
#[poise::command(slash_command, guild_only)]
pub async fn add(
    ctx: Context<'_>,
    #[description = "YouTube/Spotify URL or search query"] query: String,
) -> Result<()> {
    info!(author = %ctx.author().name, query = %query, "Executing /music queue add command");
    ctx.defer().await?;

    let reqwest_client = ctx.data().reqwest_client.clone();
    let music_state = ctx.data().music_state.clone();
    let Some(guild_id) = ctx.guild_id() else { return Ok(()) };
    let Some(manager) = songbird::get(ctx.serenity_context()).await else {
        error!("Cannot get songbird manager!");
        bail!("Cannot get songbird manager!");
    };
    let Some(vc_channel_id) = get_user_vc_in_guild(&ctx.data(), guild_id, ctx.author().id).await? else {
        debug!(author = %ctx.author().name, guild_id = %guild_id, "User not in voice channel");
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
        debug!(guild_id = %guild_id, "Transition lock active; rejecting duplicate add command");
        send_ephemeral(&ctx, "Already starting a track — try again in a moment.").await?;
        return Ok(());
    }

    let query_url = build_query_url(&reqwest_client, &query).await;
    debug!(guild_id = %guild_id, query_url = %query_url, "Fetching track metadata for add command");

    let mut src = YoutubeDl::new(reqwest_client.clone(), query_url.clone());
    let metadata = match src.aux_metadata().await {
        Ok(m) => m,
        Err(e) => {
            error!(guild_id = %guild_id, error = ?e, "Error fetching track metadata");
            music_state.with_guild(guild_id, |p| p.transitioning = false).await;
            return Err(e).context("Error fetching track metadata");
        }
    };

    let call_handler = match manager.join(guild_id, vc_channel_id).await {
        Ok(c) => c,
        Err(e) => {
            error!(guild_id = %guild_id, vc_channel_id = %vc_channel_id, error = ?e, "Failed to join voice channel");
            music_state.with_guild(guild_id, |p| p.transitioning = false).await;
            return Err(e).context("Failed to join voice channel");
        }
    };

    let resolved_query = metadata.source_url.clone().unwrap_or(query_url);
    let new_track = QueuedTrack {
        query: resolved_query,
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

        info!(guild_id = %guild_id, track_title = %title, "Queued track to end of queue");

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
    debug!(guild_id = %guild_id, uuid = %handle_uuid, "Nothing playing; starting track immediately");

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

    let title = metadata.title.as_deref().unwrap_or("untitled");
    info!(guild_id = %guild_id, track_title = %title, "Now playing track via add command");

    ctx.send(CreateReply::default().embed(CreateEmbed::new()
        .author(CreateEmbedAuthor::new(&ctx.author().name).icon_url(ctx.author().face()))
        .title(format!("Playing {}", title))
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
    info!(author = %ctx.author().name, page = ?page, "Executing /music queue list command");
    ctx.defer().await?;
    let Some(guild_id) = ctx.guild_id() else { return Ok(()) };
    let music_state = ctx.data().music_state.clone();

    let (current_meta, queue_snapshot) = music_state.with_guild(guild_id, |p| {
        (p.current_meta.clone(), p.queue.iter().cloned().collect::<Vec<_>>())
    }).await;

    if current_meta.is_none() && queue_snapshot.is_empty() {
        debug!(guild_id = %guild_id, "Queue is empty and nothing is currently playing");
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

    debug!(guild_id = %guild_id, total_tracks = total_tracks, page = page, total_pages = total_pages, "Building queue embed");

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
    info!(author = %ctx.author().name, "Executing /music queue clear command");
    ctx.defer().await?;
    let Some(guild_id) = ctx.guild_id() else { return Ok(()) };
    let music_state = ctx.data().music_state.clone();

    let count = music_state.with_guild(guild_id, |p| {
        let len = p.queue.len();
        p.queue.clear();
        len
    }).await;

    if count == 0 {
        debug!(guild_id = %guild_id, "Clear executed on empty queue");
        send_ephemeral(&ctx, "The queue is already empty.").await?;
    } else {
        info!(guild_id = %guild_id, cleared_count = count, "Cleared queue");
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
    info!(author = %ctx.author().name, position = position, "Executing /music queue remove command");
    ctx.defer().await?;
    let Some(guild_id) = ctx.guild_id() else { return Ok(()) };
    let music_state = ctx.data().music_state.clone();

    if position == 0 {
        debug!(guild_id = %guild_id, "Remove requested for invalid position 0");
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
            info!(guild_id = %guild_id, position = position, title = %title, "Removed track from queue");
            send_ephemeral(&ctx, &format!("Removed **{}** from the queue.", title)).await?;
        }
        None => {
            warn!(guild_id = %guild_id, position = position, "Position out of bounds for queue removal");
            send_ephemeral(&ctx, "Invalid position. Track not found in queue.").await?;
        }
    }

    Ok(())
}

/// Seeks to a timestamp or relative offset in the currently playing track.
#[poise::command(slash_command, guild_only)]
pub async fn seek(
    ctx: Context<'_>,
    #[description = "Timestamp or offset to seek (e.g. 1:30, +30, -15, +1:30)"] input: String,
) -> Result<()> {
    info!(author = %ctx.author().name, input = %input, "Executing /music seek command");
    ctx.defer_ephemeral().await?;

    let Some(guild_id) = ctx.guild_id() else { return Ok(()) };
    let music_state = ctx.data().music_state.clone();

    let (current_handle, current_meta) = music_state.with_guild(guild_id, |p| {
        (p.current.clone(), p.current_meta.clone())
    }).await;

    let Some(handle) = current_handle else {
        debug!(guild_id = %guild_id, "Seek requested but nothing is playing");
        send_ephemeral(&ctx, "Nothing is currently playing.").await?;
        return Ok(());
    };

    let Some(seek_mode) = parse_seek_input(&input) else {
        debug!(input = %input, "Invalid seek timestamp/offset format");
        send_ephemeral(
            &ctx,
            "Invalid input! Use timestamps like `1:30` or relative offsets like `+30`, `-15`, `+1:30`.",
        )
            .await?;
        return Ok(());
    };

    let target_duration = match seek_mode {
        SeekMode::Absolute(dur) => dur,
        SeekMode::RelativeForward(delta) => {
            let current_pos = handle
                .get_info()
                .await
                .map(|info| info.position)
                .unwrap_or(Duration::ZERO);
            current_pos + delta
        }
        SeekMode::RelativeBackward(delta) => {
            let current_pos = handle
                .get_info()
                .await
                .map(|info| info.position)
                .unwrap_or(Duration::ZERO);
            current_pos.saturating_sub(delta)
        }
    };

    debug!(guild_id = %guild_id, target_secs = target_duration.as_secs(), "Calculated target seek position");

    if let Some(ref meta) = current_meta {
        if let Some(total_duration) = meta.duration {
            if target_duration > total_duration {
                warn!(guild_id = %guild_id, target_secs = target_duration.as_secs(), total_secs = total_duration.as_secs(), "Target seek exceeds total track duration");
                send_ephemeral(
                    &ctx,
                    &format!(
                        "Cannot seek past the end of the track (Duration: `{}`).",
                        format_duration(Some(total_duration))
                    ),
                )
                    .await?;
                return Ok(());
            }
        }
    }

    match handle.seek_async(target_duration).await {
        Ok(_) => {
            info!(guild_id = %guild_id, target_secs = target_duration.as_secs(), "Successfully seeked track");
            send_ephemeral(
                &ctx,
                &format!("Seeked to `{}`.", format_duration(Some(target_duration))),
            )
                .await?;
        }
        Err(e) => {
            error!(guild_id = %guild_id, error = ?e, "Failed seek_async execution");
            send_ephemeral(&ctx, "Failed to seek in the current audio stream.").await?;
        }
    }

    Ok(())
}

#[poise::command(slash_command, guild_only)]
pub async fn skip(ctx: Context<'_>) -> Result<()> {
    info!(author = %ctx.author().name, "Executing /music skip command");
    ctx.defer().await?;
    let Some(guild_id) = ctx.guild_id() else { return Ok(()) };
    let music_state = ctx.data().music_state.clone();

    let handle = music_state.with_guild(guild_id, |p| p.current.clone()).await;
    let Some(handle) = handle else {
        debug!(guild_id = %guild_id, "Skip requested but nothing is playing");
        send_ephemeral(&ctx, "Nothing is playing.").await?;
        return Ok(());
    };

    let next_title = music_state.with_guild(guild_id, |p| {
        p.queue.front().map(|t| t.metadata.title.clone().unwrap_or("untitled".to_string()))
    }).await;

    info!(guild_id = %guild_id, "Stopping active handle to trigger skip");
    handle.stop().context("Failed to skip track")?;

    match next_title {
        Some(title) => {
            info!(guild_id = %guild_id, next_title = %title, "Skipped track; advancing to next track");
            send_ephemeral(&ctx, &format!("Skipped. Now playing **{}**.", title)).await?;
        }
        None => {
            info!(guild_id = %guild_id, "Skipped track; queue is now empty");
            send_ephemeral(&ctx, "Skipped. Queue is empty, nothing left to play.").await?;
        }
    };
    Ok(())
}

#[poise::command(slash_command, guild_only)]
pub async fn stop(ctx: Context<'_>) -> Result<()> {
    info!(author = %ctx.author().name, "Executing /music stop command");
    ctx.defer().await?;
    let Some(guild_id) = ctx.guild_id() else { return Ok(()) };
    let Some(manager) = songbird::get(ctx.serenity_context()).await else {
        error!("Cannot get songbird manager!");
        bail!("Cannot get songbird manager!");
    };
    let music_state = ctx.data().music_state.clone();

    info!(guild_id = %guild_id, "Clearing queue and stopping active track");
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

    info!(guild_id = %guild_id, "Leaving voice channel");
    manager.remove(guild_id).await.context("Failed to leave voice channel")?;
    send_ephemeral(&ctx, "Stopped and left the voice channel.").await?;
    Ok(())
}

#[poise::command(slash_command, guild_only)]
pub async fn pause(ctx: Context<'_>) -> Result<()> {
    info!(author = %ctx.author().name, "Executing /music pause command");
    ctx.defer().await?;
    let Some(guild_id) = ctx.guild_id() else { return Ok(()) };
    let music_state = ctx.data().music_state.clone();

    let handle = music_state.with_guild(guild_id, |p| p.current.clone()).await;
    let Some(handle) = handle else {
        debug!(guild_id = %guild_id, "Pause requested but nothing is playing");
        send_ephemeral(&ctx, "Nothing is playing.").await?;
        return Ok(());
    };

    info!(guild_id = %guild_id, "Pausing playback");
    handle.pause().context("Failed to pause")?;
    send_ephemeral(&ctx, "Paused.").await?;
    Ok(())
}

#[poise::command(slash_command, guild_only)]
pub async fn resume(ctx: Context<'_>) -> Result<()> {
    info!(author = %ctx.author().name, "Executing /music resume command");
    ctx.defer().await?;
    let Some(guild_id) = ctx.guild_id() else { return Ok(()) };
    let music_state = ctx.data().music_state.clone();

    let handle = music_state.with_guild(guild_id, |p| p.current.clone()).await;
    let Some(handle) = handle else {
        debug!(guild_id = %guild_id, "Resume requested but nothing is playing");
        send_ephemeral(&ctx, "Nothing is playing.").await?;
        return Ok(());
    };

    info!(guild_id = %guild_id, "Resuming playback");
    handle.play().context("Failed to resume")?;
    send_ephemeral(&ctx, "Resumed.").await?;
    Ok(())
}