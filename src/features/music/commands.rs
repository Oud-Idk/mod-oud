use anyhow::{Context as _, Result};
use poise::CreateReply;
use serenity::all::{ChannelId, CreateEmbed, CreateEmbedAuthor, GuildId, User};
use tokio::sync::mpsc::Sender;
use tokio::sync::oneshot;
use tracing::debug;

use crate::core::config::state::Context;
use crate::features::music::actor::GuildCommand;
use crate::features::music::player::format_duration;
use crate::features::music::state::StartedTrackInfo;
use crate::shared::voice_state::get_user_vc_in_guild;

const BRAND_COLOR: u32 = 0x4076f5;

async fn reply(ctx: &Context<'_>, message: impl Into<String>) -> Result<()> {
    ctx.send(CreateReply::default().content(message)).await?;
    Ok(())
}

pub struct PreparedCommand<T = Result<StartedTrackInfo>> {
    pub guild_id: GuildId,
    pub actor_tx: Sender<GuildCommand>,
    pub vc_channel_id: ChannelId,
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

async fn prepare_command<T>(ctx: &Context<'_>) -> Result<Option<PreparedCommand<T>>> {
    ctx.defer().await?;
    let Some(guild_id) = ctx.guild_id() else { return Ok(None) };

    let manager = songbird::get(ctx.serenity_context())
        .await
        .context("Failed to get song manager")?;
    let reqwest_client = ctx.data().core.reqwest_client.clone();

    let actor_tx = ctx.data().music_state
        .get_or_spawn_actor(guild_id, manager, reqwest_client)
        .await;

    let Some(vc_channel_id) = get_user_vc_in_guild(ctx.data(), guild_id, ctx.author().id).await? else {
        reply(ctx, "You are not in any voice channels!").await?;
        return Ok(None);
    };

    let (track_tx, track_rx) = oneshot::channel();

    Ok(Some(PreparedCommand {
        guild_id,
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
        "prev", "pause", "resume", "stop",
        "skip", "seek", "restart",
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
    let Some(p) = prepare_command(&ctx).await? else { return Ok(()) };
    let vc_channel_id = p.vc_channel_id;

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
    let Some(p) = prepare_command(&ctx).await? else { return Ok(()) };

    let info = p.dispatch(|respond| GuildCommand::Restart { respond }).await?;
    reply(&ctx, format!("Restarted **{}** from the beginning.", info.title)).await?;

    Ok(())
}

/// Stops the current player and leaves
#[poise::command(slash_command, guild_only)]
pub async fn stop(ctx: Context<'_>) -> Result<()> {
    let Some(p) = prepare_command(&ctx).await? else { return Ok(()) };

    p.dispatch(|respond| GuildCommand::Stop { respond }).await?;
    reply(&ctx, "Stopped current track.").await?;

    Ok(())
}

/// Pauses the current track
#[poise::command(slash_command, guild_only)]
pub async fn pause(ctx: Context<'_>) -> Result<()> {
    let Some(p) = prepare_command(&ctx).await? else { return Ok(()) };

    p.dispatch(|respond| GuildCommand::Pause { respond }).await?;
    reply(&ctx, "Paused current track.").await?;

    Ok(())
}

/// Resumes playback
#[poise::command(slash_command, guild_only)]
pub async fn resume(ctx: Context<'_>) -> Result<()> {
    let Some(p) = prepare_command(&ctx).await? else { return Ok(()) };

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
    let Some(p) = prepare_command(&ctx).await? else { return Ok(()) };

    let duration = p.dispatch(|respond| GuildCommand::Seek { input: time, respond }).await?;
    reply(&ctx, format!("Seeked current track to {}.", format_duration(Some(duration)))).await?;

    Ok(())
}