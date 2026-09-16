use crate::core::config::guild_ctx::get_guild_ctx;
use crate::core::config::settings::get_settings;
use crate::core::config::state::{BotData, Error};
use crate::features::custom_commands::custom_command::handle_custom_command;
use crate::features::custom_commands::database::get_custom_command_by_name;
use crate::features::custom_commands::types::{
    DEFAULT_PREFIX, resolve_prefix, strip_custom_prefix,
};
use serenity::all::{Context, Message};
use tracing::{debug, error, info, warn};

/// Handles a message and executes a custom command if the content matches one.
///
/// # Errors
/// Returns `Err` if either DB or the Discord layer fails.
pub async fn handle_custom_cmd(ctx: &Context, msg: &Message, data: &BotData) -> Result<(), Error> {
    if msg.author.bot {
        return Ok(());
    }
    let Some(guild_id) = msg.guild_id else {
        return Ok(());
    };

    let prefix = match get_settings(
        &data.core.db,
        &data.core.redis,
        &data.core.guild_configs_cache,
        guild_id,
    )
    .await
    {
        Ok(settings) => resolve_prefix(&settings).to_string(),
        Err(e) => {
            warn!(error = ?e, %guild_id, "Failed to load prefix; falling back to default");
            DEFAULT_PREFIX.to_string()
        }
    };
    let bot_id = ctx.cache.current_user().id;
    let Some(content_after_prefix) = strip_custom_prefix(&msg.content, &prefix, Some(bot_id))
    else {
        return Ok(());
    };
    let Some(raw_cmd_name) = content_after_prefix.split_whitespace().next() else {
        return Ok(());
    };

    info!(raw_cmd_name, "Executing command");

    let cmd_name = raw_cmd_name.to_ascii_lowercase();

    let Some(cmd) =
        get_custom_command_by_name(&data.core.db, &data.core.redis, guild_id, &cmd_name).await?
    else {
        debug!(raw_cmd_name, "Command not found though");
        return Ok(());
    };

    let gctx = get_guild_ctx(guild_id, &ctx).await?;
    let channel = ctx
        .http
        .get_channel(msg.channel_id)
        .await
        .ok()
        .and_then(serenity::all::Channel::guild);

    handle_custom_command(ctx, msg, &cmd, &data.core.redis, &gctx, channel.as_ref())
        .await
        .inspect_err(
            |e| error!(error = ?e, command = %cmd_name, "Failed to execute custom command"),
        )?;

    Ok(())
}
