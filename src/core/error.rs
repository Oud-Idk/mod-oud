use crate::core::config::state::{BotData, Error};
use tracing::error;

/// Error handler that runs on every Poise error.
///
/// # Panics
/// Will panic if setup fails.
pub async fn on_error(error: poise::FrameworkError<'_, BotData, Error>) {
    match error {
        poise::FrameworkError::Setup { error, .. } => panic!("Failed to start bot: {error:?}"),
        poise::FrameworkError::Command { error, ctx, .. } => {
            error!("Error in command `{}`: {error:#}", ctx.command().name);
            error!("Full trace: {error:?}");

            if let Err(reply_err) = ctx
                .send(
                    poise::CreateReply::default()
                        .content(format!("Something went wrong: {error:#}"))
                        .ephemeral(true),
                )
                .await
            {
                error!(
                    error = ?reply_err,
                    command = %ctx.command().name,
                    "Failed to deliver the error reply; the user saw nothing"
                );
            }
        }
        error => {
            if let Err(e) = poise::builtins::on_error(error).await {
                error!("Error while handling error: {e:#}");
            }
        }
    }
}
