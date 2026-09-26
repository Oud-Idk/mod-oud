use crate::core::config::state::{Context, Error};
use crate::features::gambling::audit;
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
    game: &'static str,
) -> Result<bool, Error> {
    if interaction.user.id != user_id {
        // Logged as well as warned, so mass-clicking another player's buttons leaves a record.
        if let Some(guild_id) = ctx.guild_id() {
            audit::non_player_interaction(
                game,
                guild_id,
                user_id,
                interaction.user.id,
                &interaction.data.custom_id,
            );
        }

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
