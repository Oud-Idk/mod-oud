use std::sync::Arc;
use std::time::Duration;

use anyhow::{bail, Context as _, Result};
use poise::CreateReply;
use serenity::all::{ChannelId, CreateEmbed, CreateEmbedAuthor, CreateEmbedFooter, GuildId, User};
use songbird::Call;
use songbird::Songbird;
use songbird::tracks::TrackHandle;
use tokio::sync::Mutex;
use tracing::{debug, error, warn};

use crate::Context;
use crate::features::music::player::OldTrackDisposition;
use crate::features::music::player::PlaybackServices;
use crate::features::music::player::{fetch_metadata, install_new_track, prepare_and_play, start_streaming};
use crate::features::music::state::{MusicState, QueuedTrack};
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

async fn reply(ctx: &Context<'_>, message: impl Into<String>) -> Result<()> {
    ctx.send(CreateReply::default().content(message)).await?;
    Ok(())
}

fn track_embed(author: &User, title: String, thumbnail: Option<String>) -> CreateEmbed {
    CreateEmbed::new()
        .author(CreateEmbedAuthor::new(&author.name).icon_url(author.face()))
        .title(title)
        .thumbnail(thumbnail.unwrap_or_default())
        .color(BRAND_COLOR)
}

/// Resolved guild/songbird/VC prerequisites shared by playback commands.
struct PlaybackContext {
    reqwest_client: reqwest::Client,
    music_state: MusicState,
    guild_id: GuildId,
    manager: Arc<Songbird>,
    vc_channel_id: ChannelId,
}

impl PlaybackContext {
    fn services(&self) -> PlaybackServices<'_> {
        PlaybackServices {
            reqwest_client: &self.reqwest_client,
            music_state: &self.music_state,
            guild_id: self.guild_id,
        }
    }
}

/// Resolves the guild, songbird manager, and the caller's voice channel; replies
/// (and returns None) when any prerequisite is missing.
async fn playback_context(ctx: &Context<'_>) -> Result<Option<PlaybackContext>> {
    let Some(guild_id) = ctx.guild_id() else {
        warn!(author = %ctx.author().name, "Command invoked outside of a guild");
        return Ok(None);
    };
    let Some(manager) = songbird::get(ctx.serenity_context()).await else {
        error!("Failed to retrieve Songbird manager");
        return Err(anyhow::anyhow!("Cannot get songbird manager!"));
    };
    let Some(vc_channel_id) = get_user_vc_in_guild(ctx.data(), guild_id, ctx.author().id).await? else {
        debug!(author = %ctx.author().name, guild_id = %guild_id, "User not in voice channel");
        reply(ctx, "You are not in any voice channels!").await?;
        return Ok(None);
    };
    Ok(Some(PlaybackContext {
        reqwest_client: ctx.data().reqwest_client.clone(),
        music_state: ctx.data().music_state.clone(),
        guild_id,
        manager,
        vc_channel_id,
    }))
}

async fn join_call(pb: &PlaybackContext) -> Result<Arc<Mutex<Call>>> {
    match pb.manager.join(pb.guild_id, pb.vc_channel_id).await {
        Ok(call) => {
            debug!(guild_id = %pb.guild_id, vc_channel_id = %pb.vc_channel_id, "Joined voice channel");
            Ok(call)
        }
        Err(e) => {
            error!(guild_id = %pb.guild_id, vc_channel_id = %pb.vc_channel_id, error = ?e, "Failed to join voice channel");
            Err(e).context("Failed to join voice channel")
        }
    }
}

/// Claims the per-guild transition lock, replying if another transition is mid-flight.
async fn require_transition(ctx: &Context<'_>, music_state: &MusicState, guild_id: GuildId) -> Result<bool> {
    let claimed = music_state.with_guild(guild_id, |p| {
        if p.transitioning {
            false
        } else {
            p.transitioning = true;
            true
        }
    }).await;
    if claimed {
        Ok(true)
    } else {
        debug!(guild_id = %guild_id, "Transition lock active; rejecting duplicate command");
        reply(ctx, "Already starting a track — try again in a moment.").await?;
        Ok(false)
    }
}

async fn release_transition(music_state: &MusicState, guild_id: GuildId) {
    music_state.with_guild(guild_id, |p| p.transitioning = false).await;
}

async fn current_handle(music_state: &MusicState, guild_id: GuildId) -> Option<TrackHandle> {
    music_state.with_guild(guild_id, |p| p.current.clone()).await
}

/// Fetches the active track handle, replying when nothing is playing.
async fn require_current(
    ctx: &Context<'_>,
    music_state: &MusicState,
    guild_id: GuildId,
    message: &str,
) -> Result<Option<TrackHandle>> {
    let Some(handle) = current_handle(music_state, guild_id).await else {
        debug!(guild_id = %guild_id, "Command requested but nothing is playing");
        reply(ctx, message).await?;
        return Ok(None);
    };
    Ok(Some(handle))
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
    debug!(author = %ctx.author().name, query = %query, "Executing /music play command");
    ctx.defer().await?;

    let Some(pb) = playback_context(&ctx).await? else { return Ok(()) };
    if !require_transition(&ctx, &pb.music_state, pb.guild_id).await? {
        return Ok(());
    }

    let query_url = build_query_url(&pb.reqwest_client, &query).await;
    debug!(guild_id = %pb.guild_id, query_url = %query_url, "Fetching metadata via YoutubeDl");

    let call = match join_call(&pb).await {
        Ok(call) => call,
        Err(e) => {
            release_transition(&pb.music_state, pb.guild_id).await;
            return Err(e);
        }
    };

    let started = match prepare_and_play(pb.services(), &call, query_url, ctx.author().name.clone(), None).await {
        Ok(started) => started,
        Err(e) => {
            release_transition(&pb.music_state, pb.guild_id).await;
            return Err(e);
        }
    };

    let title = started.metadata.title.as_deref().unwrap_or("untitled").to_string();
    let thumbnail = started.metadata.thumbnail.clone();
    let old_handle = install_new_track(&pb.music_state, pb.guild_id, started, OldTrackDisposition::History).await;
    if let Some(old_handle) = old_handle {
        debug!(guild_id = %pb.guild_id, "Stopping previous track handle");
        let _ = old_handle.stop();
    }

    debug!(guild_id = %pb.guild_id, track_title = %title, "Now playing track");
    ctx.send(CreateReply::default().embed(track_embed(ctx.author(), format!("Playing {}", title), thumbnail))).await?;
    Ok(())
}

/// Plays the previously played track from history.
#[poise::command(slash_command, guild_only)]
pub async fn prev(ctx: Context<'_>) -> Result<()> {
    debug!(author = %ctx.author().name, "Executing /music prev command");
    ctx.defer().await?;

    let Some(pb) = playback_context(&ctx).await? else { return Ok(()) };

    let prev_track = pb.music_state.with_guild(pb.guild_id, |p| p.history.pop()).await;
    let Some(prev_track) = prev_track else {
        debug!(guild_id = %pb.guild_id, "No history found to play previous track");
        reply(&ctx, "No previous tracks in history.").await?;
        return Ok(());
    };

    let call = join_call(&pb).await?;

    let started = prepare_and_play(
        pb.services(),
        &call,
        prev_track.query.clone(),
        prev_track.requested_by.clone(),
        Some(prev_track.metadata.clone()),
    ).await?;

    let title = started.metadata.title.as_deref().unwrap_or("untitled").to_string();
    let old_handle = install_new_track(&pb.music_state, pb.guild_id, started, OldTrackDisposition::QueueFront).await;
    if let Some(old_handle) = old_handle {
        let _ = old_handle.stop();
    }

    debug!(guild_id = %pb.guild_id, track_title = %title, "Playing previous track");
    reply(&ctx, &format!("Playing previous track: **{}**.", title)).await?;
    Ok(())
}

/// Restarts the currently playing track from the beginning.
#[poise::command(slash_command, guild_only)]
pub async fn restart(ctx: Context<'_>) -> Result<()> {
    debug!(author = %ctx.author().name, "Executing /music restart command");
    ctx.defer().await?;

    let Some(guild_id) = ctx.guild_id() else {
        warn!("Guild ID unavailable for /music restart");
        return Ok(());
    };
    let music_state = ctx.data().music_state.clone();

    let (old_handle, track) = music_state.with_guild(guild_id, |p| (p.current.clone(), p.current_track.clone())).await;
    let (Some(old_handle), Some(track)) = (old_handle, track) else {
        debug!(guild_id = %guild_id, "Restart command issued, but nothing is playing");
        reply(&ctx, "Nothing is currently playing.").await?;
        return Ok(());
    };

    let Some(manager) = songbird::get(ctx.serenity_context()).await else {
        error!("Songbird manager unavailable");
        bail!("Cannot get songbird manager!");
    };

    // Reuse existing call handler to avoid VC re-connects
    let call = match manager.get(guild_id) {
        Some(call) => call,
        None => {
            let Some(vc_channel_id) = get_user_vc_in_guild(ctx.data(), guild_id, ctx.author().id).await? else {
                reply(&ctx, "You are not in any voice channels!").await?;
                return Ok(());
            };
            match manager.join(guild_id, vc_channel_id).await {
                Ok(call) => call,
                Err(e) => {
                    error!(guild_id = %guild_id, error = ?e, "Failed to join VC during restart");
                    reply(&ctx, "Failed to join voice channel.").await?;
                    return Err(e).context("Failed to join voice channel");
                }
            }
        }
    };

    let requested_by = track.requested_by.clone();
    let cached_meta = track.metadata.clone();
    let title = track.metadata.title.clone().unwrap_or_else(|| "untitled".to_string());
    let services = PlaybackServices {
        reqwest_client: &ctx.data().reqwest_client,
        music_state: &music_state,
        guild_id,
    };
    let started = prepare_and_play(services, &call, track.query.clone(), requested_by, Some(cached_meta)).await?;

    music_state.with_guild(guild_id, |p| {
        p.transitioning = false;
        p.current = Some(started.handle);
    }).await;

    let _ = old_handle.stop();
    debug!(guild_id = %guild_id, track_title = %title, "Restarted track via direct stream swap");
    reply(&ctx, &format!("Restarted **{}** from the beginning.", title)).await?;
    Ok(())
}

/// Adds a track to the queue (plays immediately if nothing is active).
#[poise::command(slash_command, guild_only)]
pub async fn add(
    ctx: Context<'_>,
    #[description = "YouTube/Spotify URL or search query"] query: String,
) -> Result<()> {
    debug!(author = %ctx.author().name, query = %query, "Executing /music queue add command");
    ctx.defer().await?;

    let Some(pb) = playback_context(&ctx).await? else { return Ok(()) };
    if !require_transition(&ctx, &pb.music_state, pb.guild_id).await? {
        return Ok(());
    }

    let query_url = build_query_url(&pb.reqwest_client, &query).await;
    debug!(guild_id = %pb.guild_id, query_url = %query_url, "Fetching track metadata for add command");

    let metadata = match fetch_metadata(pb.services(), &query_url).await {
        Ok(metadata) => metadata,
        Err(e) => {
            release_transition(&pb.music_state, pb.guild_id).await;
            return Err(e);
        }
    };

    let call = match join_call(&pb).await {
        Ok(call) => call,
        Err(e) => {
            release_transition(&pb.music_state, pb.guild_id).await;
            return Err(e);
        }
    };

    let title = metadata.title.clone().unwrap_or_else(|| "untitled".to_string());
    let thumbnail = metadata.thumbnail.clone();
    let is_playing = pb.music_state.with_guild(pb.guild_id, |p| p.current.is_some()).await;

    if is_playing {
        let track = QueuedTrack {
            query: metadata.source_url.clone().unwrap_or(query_url),
            metadata: metadata.clone(),
            requested_by: ctx.author().name.clone(),
        };
        pb.music_state.with_guild(pb.guild_id, |p| {
            p.queue.push_back(track);
            p.transitioning = false;
        }).await;

        debug!(guild_id = %pb.guild_id, track_title = %title, "Queued track to end of queue");
        ctx.send(CreateReply::default().embed(track_embed(ctx.author(), format!("Queued {}", title), thumbnail))).await?;
        return Ok(());
    }

    // Nothing is playing: start playing immediately
    let started = start_streaming(pb.services(), &call, query_url, metadata, ctx.author().name.clone()).await;
    let old_handle = install_new_track(&pb.music_state, pb.guild_id, started, OldTrackDisposition::History).await;
    if let Some(old_handle) = old_handle {
        let _ = old_handle.stop();
    }

    debug!(guild_id = %pb.guild_id, track_title = %title, "Now playing track via add command");
    ctx.send(CreateReply::default().embed(track_embed(ctx.author(), format!("Playing {}", title), thumbnail))).await?;
    Ok(())
}

/// Lists all currently queued tracks.
#[poise::command(slash_command, guild_only)]
pub async fn list(
    ctx: Context<'_>,
    #[description = "Page number to view"] page: Option<usize>,
) -> Result<()> {
    debug!(author = %ctx.author().name, page = ?page, "Executing /music queue list command");
    ctx.defer().await?;
    let Some(guild_id) = ctx.guild_id() else { return Ok(()) };
    let music_state = ctx.data().music_state.clone();

    let (current_meta, queue_snapshot) = music_state.with_guild(guild_id, |p| {
        (p.current_meta.clone(), p.queue.iter().cloned().collect::<Vec<_>>())
    }).await;

    if current_meta.is_none() && queue_snapshot.is_empty() {
        debug!(guild_id = %guild_id, "Queue is empty and nothing is currently playing");
        reply(&ctx, "The queue is currently empty and nothing is playing.").await?;
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
    debug!(author = %ctx.author().name, "Executing /music queue clear command");
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
        reply(&ctx, "The queue is already empty.").await?;
    } else {
        debug!(guild_id = %guild_id, cleared_count = count, "Cleared queue");
        reply(&ctx, &format!("Cleared **{}** tracks from the queue.", count)).await?;
    }

    Ok(())
}

/// Removes a track at a specific index from the queue.
#[poise::command(slash_command, guild_only)]
pub async fn remove(
    ctx: Context<'_>,
    #[description = "Track position in queue to remove (1-based index)"] position: usize,
) -> Result<()> {
    debug!(author = %ctx.author().name, position = position, "Executing /music queue remove command");
    ctx.defer().await?;
    let Some(guild_id) = ctx.guild_id() else { return Ok(()) };
    let music_state = ctx.data().music_state.clone();

    if position == 0 {
        debug!(guild_id = %guild_id, "Remove requested for invalid position 0");
        reply(&ctx, "Position must be 1 or greater.").await?;
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
            debug!(guild_id = %guild_id, position = position, title = %title, "Removed track from queue");
            reply(&ctx, &format!("Removed **{}** from the queue.", title)).await?;
        }
        None => {
            warn!(guild_id = %guild_id, position = position, "Position out of bounds for queue removal");
            reply(&ctx, "Invalid position. Track not found in queue.").await?;
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
    debug!(author = %ctx.author().name, input = %input, "Executing /music seek command");
    ctx.defer().await?;

    let Some(guild_id) = ctx.guild_id() else { return Ok(()) };
    let music_state = ctx.data().music_state.clone();

    let Some(handle) = require_current(&ctx, &music_state, guild_id, "Nothing is currently playing.").await? else {
        return Ok(());
    };

    let current_meta = music_state.with_guild(guild_id, |p| p.current_meta.clone()).await;

    let Some(seek_mode) = parse_seek_input(&input) else {
        debug!(input = %input, "Invalid seek timestamp/offset format");
        reply(
            &ctx,
            "Invalid input! Use timestamps like `1:30` or relative offsets like `+30`, `-15`, `+1:30`.",
        ).await?;
        return Ok(());
    };

    let current_pos = handle
        .get_info()
        .await
        .map(|info| info.position)
        .unwrap_or(Duration::ZERO);
    let target_duration = match seek_mode {
        SeekMode::Absolute(dur) => dur,
        SeekMode::RelativeForward(delta) => current_pos + delta,
        SeekMode::RelativeBackward(delta) => current_pos.saturating_sub(delta),
    };

    debug!(guild_id = %guild_id, target_secs = target_duration.as_secs(), "Calculated target seek position");

    if let Some(ref meta) = current_meta {
        if let Some(total_duration) = meta.duration {
            if target_duration > total_duration {
                warn!(guild_id = %guild_id, target_secs = target_duration.as_secs(), total_secs = total_duration.as_secs(), "Target seek exceeds total track duration");
                reply(
                    &ctx,
                    &format!(
                        "Cannot seek past the end of the track (Duration: `{}`).",
                        format_duration(Some(total_duration))
                    ),
                ).await?;
                return Ok(());
            }
        }
    }

    match handle.seek_async(target_duration).await {
        Ok(_) => {
            debug!(guild_id = %guild_id, target_secs = target_duration.as_secs(), "Successfully seeked track");
            reply(&ctx, &format!("Seeked to `{}`.", format_duration(Some(target_duration)))).await?;
        }
        Err(e) => {
            error!(guild_id = %guild_id, error = ?e, "Failed seek_async execution");
            reply(&ctx, "Failed to seek in the current audio stream.").await?;
        }
    }

    Ok(())
}

#[poise::command(slash_command, guild_only)]
pub async fn skip(ctx: Context<'_>) -> Result<()> {
    debug!(author = %ctx.author().name, "Executing /music skip command");
    ctx.defer().await?;
    let Some(guild_id) = ctx.guild_id() else { return Ok(()) };
    let music_state = ctx.data().music_state.clone();

    let Some(handle) = require_current(&ctx, &music_state, guild_id, "Nothing is playing.").await? else {
        return Ok(());
    };

    let next_title = music_state.with_guild(guild_id, |p| {
        p.queue.front().map(|t| t.metadata.title.clone().unwrap_or("untitled".to_string()))
    }).await;

    handle.stop().context("Failed to skip track")?;

    match next_title {
        Some(title) => {
            debug!(guild_id = %guild_id, next_title = %title, "Skipped track; advancing to next track");
            reply(&ctx, &format!("Skipped. Now playing **{}**.", title)).await?;
        }
        None => {
            debug!(guild_id = %guild_id, "Skipped track; queue is now empty");
            reply(&ctx, "Skipped. Queue is empty, nothing left to play.").await?;
        }
    };
    Ok(())
}

#[poise::command(slash_command, guild_only)]
pub async fn stop(ctx: Context<'_>) -> Result<()> {
    debug!(author = %ctx.author().name, "Executing /music stop command");
    ctx.defer().await?;
    let Some(guild_id) = ctx.guild_id() else { return Ok(()) };
    let Some(manager) = songbird::get(ctx.serenity_context()).await else {
        error!("Cannot get songbird manager!");
        bail!("Cannot get songbird manager!");
    };
    let music_state = ctx.data().music_state.clone();

    debug!(guild_id = %guild_id, "Clearing queue and stopping active track");
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

    debug!(guild_id = %guild_id, "Leaving voice channel");
    manager.remove(guild_id).await.context("Failed to leave voice channel")?;
    reply(&ctx, "Stopped and left the voice channel.").await?;
    Ok(())
}

#[poise::command(slash_command, guild_only)]
pub async fn pause(ctx: Context<'_>) -> Result<()> {
    debug!(author = %ctx.author().name, "Executing /music pause command");
    ctx.defer().await?;
    let Some(guild_id) = ctx.guild_id() else { return Ok(()) };
    let music_state = ctx.data().music_state.clone();

    let Some(handle) = require_current(&ctx, &music_state, guild_id, "Nothing is playing.").await? else {
        return Ok(());
    };

    handle.pause().context("Failed to pause")?;
    reply(&ctx, "Paused.").await?;
    Ok(())
}

#[poise::command(slash_command, guild_only)]
pub async fn resume(ctx: Context<'_>) -> Result<()> {
    debug!(author = %ctx.author().name, "Executing /music resume command");
    ctx.defer().await?;
    let Some(guild_id) = ctx.guild_id() else { return Ok(()) };
    let music_state = ctx.data().music_state.clone();

    let Some(handle) = require_current(&ctx, &music_state, guild_id, "Nothing is playing.").await? else {
        return Ok(());
    };

    handle.play().context("Failed to resume")?;
    reply(&ctx, "Resumed.").await?;
    Ok(())
}