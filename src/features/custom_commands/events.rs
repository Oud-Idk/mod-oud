use tracing::{debug, error, info};
use serenity::all::{Context, Message};
use crate::{Data, Error};
use crate::core::config::guild_ctx::get_guild_ctx;
use crate::features::custom_commands::custom_command::handle_custom_command;
use crate::features::custom_commands::database::get_custom_command_by_name;

pub async fn handle_custom_cmd(ctx: &Context, msg: &Message, data: &Data) -> Result<(), Error> {
    if msg.author.bot { return Ok(()); };
    let Some(guild_id) = msg.guild_id else { return Ok(()); };

    let prefix = "!"; // Make it changeable later
    if !msg.content.starts_with(prefix) {
        return Ok(());
    }

    let content_after_prefix = &msg.content[prefix.len()..];
    let Some(raw_cmd_name) = content_after_prefix.split_whitespace().next() else {
        return Ok(());
    };

    info!(raw_cmd_name, "Executing command");

    let cmd_name = raw_cmd_name.to_ascii_lowercase();
    let guild_id_i64 = guild_id.get() as i64;

    let Some(cmd) = get_custom_command_by_name(&data.db, &data.redis, guild_id_i64, &cmd_name).await? else {
        debug!(raw_cmd_name, "Command not found though");
        return Ok(());
    };

    let gctx = get_guild_ctx(guild_id, &ctx).await?;
    let channel = ctx.http.get_channel(msg.channel_id).await.ok().and_then(|c| c.guild());

    handle_custom_command(&ctx, &msg, &cmd, &data.redis, &gctx, channel.as_ref()).await
        .inspect_err(|e| error!(error = ?e, command = %cmd_name, "Failed to execute custom command"))?;

    Ok(())
}