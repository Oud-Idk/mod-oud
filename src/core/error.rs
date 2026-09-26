use crate::core::config::state::{BotData, Context, Error};
use crate::shared::messages::send_ephemeral;
use tracing::error;

/// Shown to the user on any internal error. Never put an error chain here: it can carry SQL
/// text, host paths and API keys from upstream URLs.
const INTERNAL_ERROR_MESSAGE: &str =
    "Something went wrong on our end. The details have been logged, please try again.";

/// Error handler that runs on every Poise error.
///
/// Every internal error is logged with `command`, `guild_id` and `user_id` so failures are
/// attributable. The user only ever sees [`INTERNAL_ERROR_MESSAGE`].
///
/// # Panics
/// Panics if user data setup fails.
pub async fn on_error(error: poise::FrameworkError<'_, BotData, Error>) {
    match error {
        poise::FrameworkError::Setup { error, .. } => {
            error!(
                error = ?error,
                error_chain = %format!("{error:#}"),
                "Fatal: user data setup failed; aborting startup"
            );
            panic!("Failed to start bot: {error:?}");
        }

        // No user to reply to, so this log line is the only record.
        poise::FrameworkError::EventHandler { error, event, .. } => {
            error!(
                event = event.snake_case_name(),
                error = ?error,
                error_chain = %format!("{error:#}"),
                "Event handler failed"
            );
        }

        poise::FrameworkError::Command { error, ctx, .. } => {
            error!(
                command = %ctx.command().qualified_name,
                guild_id = ?ctx.guild_id(),
                user_id = %ctx.author().id,
                error = ?error,
                error_chain = %format!("{error:#}"),
                "Command failed"
            );
            reply_internal_error(&ctx).await;
        }

        // `builtins` drops the payload without logging it. Reply here too, to avoid
        // sending two replies.
        poise::FrameworkError::CommandPanic { payload, ctx, .. } => {
            error!(
                command = %ctx.command().qualified_name,
                guild_id = ?ctx.guild_id(),
                user_id = %ctx.author().id,
                panic = ?payload,
                "Command panicked"
            );
            reply_internal_error(&ctx).await;
        }

        // Bad arguments, missing permissions, cooldowns. `builtins` already explains
        // these well, and they are not internal faults.
        other => {
            if let Err(e) = poise::builtins::on_error(other).await {
                error!(error = %e, "Error while handling a user-facing framework error");
            }
        }
    }
}

/// Tells the user something went wrong, without leaking the error chain.
async fn reply_internal_error(ctx: &Context<'_>) {
    if let Err(reply_err) = send_ephemeral(ctx, INTERNAL_ERROR_MESSAGE).await {
        error!(
            command = %ctx.command().qualified_name,
            guild_id = ?ctx.guild_id(),
            user_id = %ctx.author().id,
            error = ?reply_err,
            "Failed to deliver the error reply; the user saw nothing. Expected if the command \
             already deferred"
        );
    }
}
