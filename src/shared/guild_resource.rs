use serenity::all::{ChannelId, GuildId, Http, MessageId};

/// A boxed serenity error, so the guard's `Result` stays small.
pub type BoxedError = Box<serenity::Error>;

/// Returns whether `channel_id` resolves to `guild_id` on Discord.
///
/// Web handlers receive the guild they authorized in the path and the Discord resources to act
/// on in the body, so the two can disagree. Every handler that mutates or reads a caller-supplied
/// channel has to run this first, or a manager of one guild can aim the bot's credentials at
/// another guild's channel.
///
/// A channel Discord does not return counts as refused. Callers that treat a missing channel as a
/// no-op decide that themselves by inspecting the error.
///
/// # Errors
/// Returns the serenity error when the channel lookup itself fails, including a 404.
pub async fn channel_in_guild(
    http: &Http,
    channel_id: ChannelId,
    guild_id: GuildId,
) -> Result<bool, BoxedError> {
    let channel = channel_id.to_channel(http).await.map_err(Box::new)?;
    Ok(serenity::all::Channel::guild(channel).is_some_and(|channel| channel.guild_id == guild_id))
}

/// Returns whether `message_id` in `channel_id` resolves to `guild_id` on Discord.
///
/// Use when a handler needs to prove a message belongs to the authorized guild and the channel is
/// itself not yet trusted.
///
/// # Errors
/// Returns the serenity error when the channel or message lookup fails, including a 404.
pub async fn message_in_guild(
    http: &Http,
    channel_id: ChannelId,
    message_id: MessageId,
    guild_id: GuildId,
) -> Result<bool, BoxedError> {
    if !channel_in_guild(http, channel_id, guild_id).await? {
        return Ok(false);
    }
    let message = channel_id
        .message(http, message_id)
        .await
        .map_err(Box::new)?;
    Ok(message.guild_id.is_some_and(|owner| owner == guild_id))
}

/// Refuses a channel that does not resolve to `guild_id`, for the `(StatusCode, String)` handlers.
///
/// Wraps [`channel_in_guild`] with the response shape the axum web handlers already return.
///
/// # Errors
/// Returns `403` when the channel belongs to another guild, and `500` when the lookup fails.
pub async fn ensure_channel_in_guild(
    http: &Http,
    channel_id: ChannelId,
    guild_id: GuildId,
) -> Result<(), (axum::http::StatusCode, String)> {
    use axum::http::StatusCode;

    match channel_in_guild(http, channel_id, guild_id).await {
        Ok(true) => Ok(()),
        Ok(false) => {
            tracing::warn!(
                %guild_id,
                %channel_id,
                "refused a Discord operation on a channel owned by another guild"
            );
            Err((
                StatusCode::FORBIDDEN,
                "That channel does not belong to this server.".to_string(),
            ))
        }
        Err(e) => {
            tracing::warn!(error = ?e, %guild_id, %channel_id, "channel ownership lookup failed");
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                "Internal server error.".to_string(),
            ))
        }
    }
}
