use crate::Error;
use crate::core::config::guild_ctx::GuildCtx;
use crate::features::custom_commands::payload::{pick_payload, send_payload};
use crate::features::custom_commands::placeholders;
use crate::features::custom_commands::types::{CommandAction, CooldownType, CustomCommand};
use fred::clients::Client;
use fred::interfaces::KeysInterface;
use fred::types::Expiration;
use serenity::all::{ChannelId, Context, GuildChannel, Message, RoleId};

pub async fn handle_custom_command(
    ctx: &Context,
    msg: &Message,
    command: &CustomCommand,
    redis: &Client,
    guild_ctx: &GuildCtx,
    channel: Option<&GuildChannel>,
) -> Result<(), Error> {
    if !command.enabled {
        return Ok(());
    }

    let channel_id = msg.channel_id.get() as i64;
    if !command.allowed_channels.is_empty() && !command.allowed_channels.contains(&channel_id) {
        return Ok(());
    }
    if command.ignored_channels.contains(&channel_id) {
        return Ok(());
    }

    if let Some(member) = &msg.member {
        let user_roles: Vec<i64> = member.roles.iter().map(|r| r.get() as i64).collect();

        if !command.allowed_roles.is_empty() && !user_roles.iter().any(|r| command.allowed_roles.contains(r)) {
            return Ok(());
        }
        if user_roles.iter().any(|r| command.ignored_roles.contains(r)) {
            return Ok(());
        }
    }

    if command.cooldown_seconds > 0 {
        let key = match command.cooldown_type {
            CooldownType::User => format!("cmd_cd:{}:{}", command.id, msg.author.id),
            CooldownType::Server => format!("cmd_cd:{}", command.id),
            CooldownType::None => String::new(),
        };

        if !key.is_empty() {
            let is_on_cooldown: bool = redis.exists(&key).await?;
            if is_on_cooldown {
                return Ok(()); // TODO send a quick cooldown notice
            }
            let _: () = redis.set(&key, "1", Some(Expiration::EX(command.cooldown_seconds as i64)), None, false).await?;
        }
    }

    if command.delete_trigger {
        let _ = msg.delete(&ctx.http).await;
    }

    for action in command.actions.iter() {
        execute_payload(&ctx, msg, &guild_ctx, channel, action).await?;
    }

    Ok(())
}

async fn execute_payload(ctx: &&Context, msg: &Message, gctx: &GuildCtx, channel: Option<&GuildChannel>, action: &CommandAction) -> Result<(), Error> {
    match action {
        CommandAction::SendChannelMessage { channel_id, messages, randomize } => {
            let payload = pick_payload(messages, *randomize);
            let cid = ChannelId::new(channel_id.parse()?);
            send_payload(&ctx.http, cid, payload, |t| placeholders::replace_general_placeholders(t, msg, &gctx, channel)).await?;
        }
        CommandAction::RespondCurrentChannel { is_dm, messages, randomize, .. } => {
            let payload = pick_payload(messages, *randomize);
            if *is_dm {
                let dm_channel = msg.author.create_dm_channel(&ctx.http).await?;
                send_payload(&ctx.http, dm_channel.id, payload, |t| placeholders::replace_general_placeholders(t, msg, &gctx, channel)).await?;
            } else {
                send_payload(&ctx.http, msg.channel_id, payload, |t| placeholders::replace_general_placeholders(t, msg, &gctx, channel)).await?;
            }
        }
        CommandAction::AddRole { role_id } => {
            let role_id = RoleId::new(role_id.parse()?);
            let _ = ctx.http
                .add_member_role(msg.guild_id.unwrap(), msg.author.id, role_id, Some("Custom Command Action"))
                .await;
        }
        CommandAction::RemoveRole { role_id } => {
            let role_id = RoleId::new(role_id.parse()?);
            let _ = ctx.http
                .remove_member_role(msg.guild_id.unwrap(), msg.author.id, role_id, Some("Custom Command Action"))
                .await;
        }
    }
    Ok(())
}