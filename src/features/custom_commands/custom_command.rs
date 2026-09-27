use crate::core::config::guild_ctx::GuildCtx;
use crate::core::config::state::Error;
use crate::features::custom_commands::cache;
use crate::features::custom_commands::payload::{pick_payload, send_payload};
use crate::features::custom_commands::placeholders;
use crate::features::custom_commands::types::{CommandAction, CooldownType, CustomCommand};
use crate::shared::permissions::HasRoles;
use fred::clients::Client;
use serenity::all::{ChannelId, Context, GuildChannel, GuildId, Message, RoleId};
use tracing::{debug, warn};

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

    let channel_id = msg.channel_id;
    if !command.allowed_channels.is_empty() && !command.allowed_channels.contains(&channel_id) {
        return Ok(());
    }
    if command.ignored_channels.contains(&channel_id) {
        return Ok(());
    }

    if let Some(member) = &msg.member {
        if !command.allowed_roles.is_empty() && !member.has_any_role(&command.allowed_roles) {
            return Ok(());
        }
        if member.has_any_role(&command.ignored_roles) {
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
            let is_on_cooldown = cache::check_and_set_command_cooldown(
                redis,
                &key,
                i64::from(command.cooldown_seconds),
            )
            .await?;
            if is_on_cooldown {
                msg.reply(&ctx.http, "You are on cooldown!").await?;
                return Ok(());
            }
        }
    }

    if command.delete_trigger
        && let Err(e) = msg.delete(&ctx.http).await
    {
        warn!(
            error = ?e,
            message_id = %msg.id,
            "custom command trigger not deleted; the trigger stays visible"
        );
    }

    for (action_index, action) in command.actions.iter().enumerate() {
        execute_payload(
            &ctx,
            msg,
            guild_ctx,
            channel,
            action,
            command.id,
            action_index,
        )
        .await?;
    }

    Ok(())
}

/// Parses a snowflake out of a dashboard JSONB action field.
///
/// Returns `None` and skips the action if the value is not numeric, logging the raw string.
/// `actions` is free-form JSONB, so a typo there is otherwise invisible.
fn parse_action_snowflake(
    raw: &str,
    command_id: i64,
    action_index: usize,
    field: &str,
) -> Option<u64> {
    match raw.parse::<u64>() {
        Ok(snowflake) => Some(snowflake),
        Err(e) => {
            // The action is dropped, so this line is the only trace of a bad dashboard row.
            warn!(
                error = ?e,
                %command_id,
                action_index,
                field,
                raw_value = raw,
                "custom command action has a non-numeric snowflake; skipping it"
            );
            None
        }
    }
}

async fn execute_payload(
    ctx: &&Context,
    msg: &Message,
    gctx: &GuildCtx,
    channel: Option<&GuildChannel>,
    action: &CommandAction,
    command_id: i64,
    action_index: usize,
) -> Result<(), Error> {
    // Read once so no log statement can panic on the `None` path.
    let Some(guild_id) = msg.guild_id else {
        debug!(
            %command_id,
            action_index,
            user_id = %msg.author.id,
            "custom command action ran outside a guild; nothing to execute"
        );
        return Ok(());
    };

    match action {
        CommandAction::SendChannelMessage {
            channel_id,
            message_layout,
        } => {
            let Some(raw_channel_id) =
                parse_action_snowflake(channel_id, command_id, action_index, "channel_id")
            else {
                return Ok(());
            };
            let payload = pick_payload(&message_layout.messages, message_layout.randomize);
            let cid = ChannelId::new(raw_channel_id);
            send_payload(&ctx.http, cid, payload, |t| {
                placeholders::replace_general_placeholders(t, msg, gctx, channel)
            })
            .await?;
        }
        CommandAction::RespondCurrentChannel {
            is_dm,
            message_layout,
            ..
        } => {
            let payload = pick_payload(&message_layout.messages, message_layout.randomize);
            if *is_dm {
                let dm_channel = msg.author.create_dm_channel(&ctx.http).await?;
                send_payload(&ctx.http, dm_channel.id, payload, |t| {
                    placeholders::replace_general_placeholders(t, msg, gctx, channel)
                })
                .await?;
            } else {
                send_payload(&ctx.http, msg.channel_id, payload, |t| {
                    placeholders::replace_general_placeholders(t, msg, gctx, channel)
                })
                .await?;
            }
        }
        CommandAction::AddRole { role_id } => {
            add_role_action(ctx, msg, guild_id, command_id, action_index, role_id).await;
        }
        CommandAction::RemoveRole { role_id } => {
            remove_role_action(ctx, msg, guild_id, command_id, action_index, role_id).await;
        }
    }
    Ok(())
}

/// Grants the invoker the configured role. Failures do not stop the other actions, so the
/// partial execution is logged as well as the error.
async fn add_role_action(
    ctx: &Context,
    msg: &Message,
    guild_id: GuildId,
    command_id: i64,
    action_index: usize,
    raw_role_id: &str,
) {
    let Some(role_id) = parse_action_snowflake(raw_role_id, command_id, action_index, "role_id")
    else {
        return;
    };
    let role_id = RoleId::new(role_id);

    if let Err(e) = ctx
        .http
        .add_member_role(
            guild_id,
            msg.author.id,
            role_id,
            Some("Custom Command Action"),
        )
        .await
    {
        warn!(
            error = ?e,
            %guild_id,
            %command_id,
            user_id = %msg.author.id,
            %role_id,
            "custom command role not added; the member did not receive it"
        );
        debug!(
            %guild_id,
            %command_id,
            user_id = %msg.author.id,
            %role_id,
            "custom command executed partially"
        );
    }
}

/// Revokes the configured role from the invoker. Same partial-failure handling as
/// [`add_role_action`].
async fn remove_role_action(
    ctx: &Context,
    msg: &Message,
    guild_id: GuildId,
    command_id: i64,
    action_index: usize,
    raw_role_id: &str,
) {
    let Some(role_id) = parse_action_snowflake(raw_role_id, command_id, action_index, "role_id")
    else {
        return;
    };
    let role_id = RoleId::new(role_id);

    if let Err(e) = ctx
        .http
        .remove_member_role(
            guild_id,
            msg.author.id,
            role_id,
            Some("Custom Command Action"),
        )
        .await
    {
        warn!(
            error = ?e,
            %guild_id,
            %command_id,
            user_id = %msg.author.id,
            %role_id,
            "custom command role not removed; the member kept the role"
        );
        debug!(
            %guild_id,
            %command_id,
            user_id = %msg.author.id,
            %role_id,
            "custom command executed partially"
        );
    }
}
