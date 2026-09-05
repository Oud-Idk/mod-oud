use crate::core::config::state::{Context, Error};
use serenity::all::{
    ComponentInteraction, CreateInteractionResponse, CreateInteractionResponseMessage, UserId,
};

/// Warns users who interact with a game that isn't theirs.
///
/// # Errors
/// Returns [`Err`] if fails to send warn message.
pub async fn warn_non_player(
    ctx: &Context<'_>,
    interaction: &ComponentInteraction,
    user_id: UserId,
) -> Result<bool, Error> {
    if interaction.user.id != user_id {
        interaction
            .create_response(
                ctx.serenity_context(),
                CreateInteractionResponse::Message(
                    CreateInteractionResponseMessage::new()
                        .content("This is not your game!")
                        .ephemeral(true),
                ),
            )
            .await?;
        return Ok(true);
    }
    Ok(false)
}
