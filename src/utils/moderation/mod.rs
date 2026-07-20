use crate::types::{Context, Error};
use crate::utils::logger::{log_moderation_action, ActionType};
use serenity::all::GuildId;
use tracing::trace;

pub mod database;
pub mod macros;
pub mod actions;
pub mod issuing;

pub const MODERATION_FOOTER: &str = "If you believe this was a mistake, please create a ticket on the server.";

/// Logs the action to the database and dispatches the log system's Discord embed.
pub async fn log_action(
    ctx: &Context<'_>,
    guild_id: GuildId,
    target_id: u64,
    action: ActionType,
    reason: Option<&str>,
) -> Result<(), Error> {
    trace!(
        guild_id = guild_id.get(),
        target_id,
        action = ?action,
        "Dispatching moderation log to database and Discord integration"
    );
    log_moderation_action(
        &ctx.data().db, guild_id, None, &ctx.author(), None, reason.unwrap_or_default(), None,
    ).await?;
    Ok(())
}