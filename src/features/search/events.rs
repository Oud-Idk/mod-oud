use crate::constants::BRAND_COLOR;
use crate::core::config::state::{BotData, Error};
use crate::features::music::{GuildCommand, QueueAddOutcome, QueueAddPayload};
use crate::shared::voice_state::get_user_vc_in_guild;
use serenity::all::{
    ComponentInteraction, Context, CreateEmbed, CreateEmbedAuthor, CreateInteractionResponse,
    CreateInteractionResponseMessage, EditInteractionResponse, User,
};
use tokio::sync::oneshot;

/// Handles `▶️ Play in VC` buttons added to `/search spotify` and `/search youtube` results.
///
/// Returns whether the button was recognized and handled.
///
/// # Errors
/// Fails when reading voice state or sending the initial interaction
/// responses fails.
pub async fn handle_search_play(
    ctx: &Context,
    component: &ComponentInteraction,
    data: &BotData,
) -> Result<bool, Error> {
    let Some(query) = parse_play_query(component.data.custom_id.as_str()) else {
        return Ok(false);
    };

    let Some(guild_id) = component.guild_id else {
        respond_ephemeral(ctx, component, "This can only be used in a server.").await?;
        return Ok(true);
    };

    // VC check: refuse if user not in any voice channel
    let vc_channel_id = match get_user_vc_in_guild(data, guild_id, component.user.id).await {
        Ok(Some(id)) => id,
        Ok(None) => {
            respond_ephemeral(ctx, component, "You are not in any voice channels!").await?;
            return Ok(true);
        }
        Err(e) => {
            tracing::warn!(error = ?e, "Failed to lookup user VC for search play");
            respond_ephemeral(
                ctx,
                component,
                "Failed to check your voice channel. Please try again.",
            )
            .await?;
            return Ok(true);
        }
    };

    // Defer to give the music actor time to resolve + start playback
    component
        .create_response(
            &ctx.http,
            CreateInteractionResponse::Defer(CreateInteractionResponseMessage::new()),
        )
        .await?;

    // Note: bound to a temp first; awaits inside a let-else on an awaited
    // initializer confuse rustc's desugaring (E0308 downstream).
    let manager = songbird::get(ctx).await;
    let Some(manager) = manager else {
        edit_reply(
            ctx,
            component,
            "Music system is currently unavailable. Please try again later.",
        )
        .await;
        return Ok(true);
    };

    let actor_tx = data
        .music_state
        .get_or_spawn_actor(guild_id, manager, data.core.reqwest_client.clone())
        .await;

    let (tx, rx) = oneshot::channel();
    let payload = QueueAddPayload {
        query,
        vc_channel_id,
        requested_by: component.user.clone(),
        respond: tx,
    };

    if let Err(e) = actor_tx
        .send(GuildCommand::QueueAdd(Box::new(payload)))
        .await
    {
        edit_reply(ctx, component, &format!("Failed to queue track: {e}")).await;
        return Ok(true);
    }

    match rx.await {
        Ok(Ok(outcome)) => report_outcome(ctx, component, outcome).await,
        Ok(Err(e)) => edit_reply(ctx, component, &format!("Failed to play: {e}")).await,
        Err(_) => {
            edit_reply(
                ctx,
                component,
                "Music actor did not respond in time. Please try again.",
            )
            .await;
        }
    }

    Ok(true)
}

/// Maps a button custom ID to the track URL it encodes.
fn parse_play_query(custom_id: &str) -> Option<String> {
    let track_id = custom_id.strip_prefix("search_spotify_play:");
    let video_id = custom_id.strip_prefix("search_youtube_play:");

    match (track_id, video_id) {
        (Some(id), _) if !id.is_empty() => Some(format!("https://open.spotify.com/track/{id}")),
        (_, Some(id)) if !id.is_empty() => Some(format!("https://www.youtube.com/watch?v={id}")),
        _ => None,
    }
}

/// Replies ephemerally; used for pre-defer validation errors.
async fn respond_ephemeral(
    ctx: &Context,
    component: &ComponentInteraction,
    content: &str,
) -> Result<(), Error> {
    component
        .create_response(
            &ctx.http,
            CreateInteractionResponse::Message(
                CreateInteractionResponseMessage::new()
                    .content(content)
                    .ephemeral(true),
            ),
        )
        .await?;
    Ok(())
}

/// Edits the deferred reply; failures are swallowed since the interaction is already acknowledged.
async fn edit_reply(ctx: &Context, component: &ComponentInteraction, content: &str) {
    let _ = component
        .edit_response(&ctx.http, EditInteractionResponse::new().content(content))
        .await;
}

/// Reports a successful queue/play outcome as an embed.
async fn report_outcome(ctx: &Context, component: &ComponentInteraction, outcome: QueueAddOutcome) {
    let (title, thumbnail) = match outcome {
        QueueAddOutcome::Played(info) => (format!("Playing {}", info.title), info.thumbnail),
        QueueAddOutcome::Queued(info) => {
            (format!("Added to queue: {}", info.title), info.thumbnail)
        }
        QueueAddOutcome::PlaylistQueued { first_track, count } => (
            format!(
                "Queued {} tracks (starting with {})",
                count, first_track.title
            ),
            first_track.thumbnail,
        ),
    };
    let embed = build_track_embed(&component.user, title, thumbnail);
    let _ = component
        .edit_response(&ctx.http, EditInteractionResponse::new().embed(embed))
        .await;
}

fn build_track_embed(author: &User, title: String, thumbnail: Option<String>) -> CreateEmbed {
    CreateEmbed::new()
        .author(CreateEmbedAuthor::new(&author.name).icon_url(author.face()))
        .title(title)
        .thumbnail(thumbnail.unwrap_or_default())
        .color(BRAND_COLOR)
}
