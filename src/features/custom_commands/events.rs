use crate::core::config::guild_ctx::get_guild_ctx;
use crate::core::config::settings::get_settings;
use crate::core::config::state::{BotData, Error};
use crate::features::custom_commands::custom_command::handle_custom_command;
use crate::features::custom_commands::database::{
    get_anywhere_command_names, get_custom_command_by_name,
};
use crate::features::custom_commands::types::{
    CustomCommand, DEFAULT_PREFIX, find_anywhere_matches, resolve_prefix, strip_custom_prefix,
};
use serenity::all::{Context, GuildId, Message};
use tracing::{debug, error, info, warn};

/// Handles a message and executes a custom command if the content matches one.
///
/// Prefix (or mention) messages use the exact single-command path only.
/// All other messages are scanned for anywhere-enabled triggers, firing every
/// match so a message like `"see rule-1 and info"` runs both.
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

    if let Some(content_after_prefix) = strip_custom_prefix(&msg.content, &prefix, Some(bot_id)) {
        let Some(raw_cmd_name) = content_after_prefix.split_whitespace().next() else {
            return Ok(());
        };

        info!(raw_cmd_name, "Executing command");

        let cmd_name = raw_cmd_name.to_ascii_lowercase();

        let Some(cmd) =
            get_custom_command_by_name(&data.core.db, &data.core.redis, guild_id, &cmd_name)
                .await?
        else {
            debug!(raw_cmd_name, "Command not found though");
            return Ok(());
        };

        execute_matched(ctx, msg, data, guild_id, &cmd, &cmd_name).await?;
        return Ok(());
    }

    let names = get_anywhere_command_names(&data.core.db, &data.core.redis, guild_id).await?;
    if names.is_empty() {
        return Ok(());
    }
    let matched = find_anywhere_matches(&msg.content, &names);
    if matched.is_empty() {
        return Ok(());
    }

    info!(commands = ?matched, "Executing anywhere commands");

    for cmd_name in &matched {
        let Some(cmd) =
            get_custom_command_by_name(&data.core.db, &data.core.redis, guild_id, cmd_name).await?
        else {
            debug!(cmd_name, "Anywhere command vanished before execution");
            continue;
        };
        execute_matched(ctx, msg, data, guild_id, &cmd, cmd_name).await?;
    }

    Ok(())
}

/// Resolves guild/channel context and runs a single matched command.
async fn execute_matched(
    ctx: &Context,
    msg: &Message,
    data: &BotData,
    guild_id: GuildId,
    cmd: &CustomCommand,
    cmd_name: &str,
) -> Result<(), Error> {
    let gctx = get_guild_ctx(guild_id, ctx).await?;
    let channel = ctx
        .http
        .get_channel(msg.channel_id)
        .await
        .ok()
        .and_then(serenity::all::Channel::guild);

    handle_custom_command(ctx, msg, cmd, &data.core.redis, &gctx, channel.as_ref())
        .await
        .inspect_err(
            |e| error!(error = ?e, command = %cmd_name, "Failed to execute custom command"),
        )?;

    Ok(())
}
