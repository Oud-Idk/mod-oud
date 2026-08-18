use crate::core::config::state::{BotData, Error};
use crate::events::interact::on_interact;
use crate::features::{
    automod, custom_commands, invite_tracking, join_leave, leveling, media_only, message_logging,
    raid_detection, reaction_roles, starboard, temp_voice, tickets,
};
use crate::shared::store_username_relation;
use crate::shared::voice_state::sync_guild_voice_state;
use anyhow::Result;
use poise::serenity_prelude as serenity;
use poise::serenity_prelude::FullEvent;

/// Central gateway event dispatcher registered as the Poise event handler.
///
/// This is the single entry point for every Discord gateway event the bot
/// receives. It first captures user names for the username relation store, then
/// routes each [`FullEvent`] variant to the relevant feature modules
///
/// A short-circuit return happens after automod intercepts a message (the
/// offending message is consumed and no further message features run).
///
/// # Arguments
/// * `ctx` - Serenity framework context.
/// * `event` - The gateway event being dispatched.
/// * `_framework` - Poise framework context (unused, reserved for future use).
/// * `data` - Shared bot state.
///
/// # Errors
/// Propagates any error raised by the underlying feature handlers.
pub async fn dispatch_events(
    ctx: &serenity::Context,
    event: &FullEvent,
    _framework: poise::FrameworkContext<'_, BotData, Error>,
    data: &BotData,
) -> Result<()> {
    extract_and_store_username(data, event).await?;

    match event {
        FullEvent::MessageDelete {
            channel_id,
            deleted_message_id,
            guild_id,
        } => {
            on_message_delete(ctx, data, channel_id, deleted_message_id, guild_id.as_ref()).await?;
        }

        FullEvent::MessageUpdate {
            old_if_available,
            new,
            event,
        } => {
            message_logging::log_message_update(
                ctx,
                old_if_available.as_ref(),
                new.as_ref(),
                event,
                data,
            )
                .await?;
        }

        FullEvent::Message { new_message } => {
            on_message(ctx, data, new_message).await?;
        }

        FullEvent::GuildMemberAddition { new_member } => {
            on_member_join(ctx, data, new_member).await?;
        }

        FullEvent::GuildMemberRemoval {
            guild_id,
            user,
            member_data_if_available,
        } => {
            join_leave::send_leave_message(ctx, *guild_id, user, member_data_if_available, data)
                .await?;
        }

        FullEvent::InteractionCreate { interaction } => {
            on_interact(ctx, interaction, data).await?;
        }

        FullEvent::ReactionAdd { add_reaction } => {
            starboard::handle_reaction_add(ctx, add_reaction, data).await?;
            reaction_roles::handle_reaction_role_add(ctx, add_reaction, data).await?;
        }

        FullEvent::ReactionRemove { removed_reaction } => {
            starboard::handle_reaction_remove(ctx, removed_reaction, data).await?;
            reaction_roles::handle_reaction_role_remove(ctx, removed_reaction, data).await?;
        }

        FullEvent::VoiceStateUpdate { old, new } => {
            on_voice_state_update(ctx, data, old.as_ref(), new).await?;
        }

        FullEvent::AutoModActionExecution { execution } => {
            automod::store_automod(ctx, execution, data).await?;
        }

        FullEvent::GuildCreate { guild, .. } => {
            Box::pin(async move {
                invite_tracking::fetch_current_invites(ctx, guild, data).await?;
                sync_guild_voice_state(guild, data).await?;
                Ok::<(), Error>(())
            })
                .await?;
        }

        FullEvent::InviteCreate { data: invite_data } => {
            invite_tracking::store_invite(ctx, invite_data, data).await?;
        }

        FullEvent::InviteDelete { data: invite_data } => {
            invite_tracking::delete_invite(ctx, invite_data, data).await?;
        }

        FullEvent::AutoModRuleCreate { rule } | FullEvent::AutoModRuleUpdate { rule } => {
            automod::cache_automod_name(&data.core.redis, rule.id, rule).await?;
        }
        FullEvent::AutoModRuleDelete { rule } => {
            automod::invalidate_rule_cache(&data.core.redis, rule.id).await?;
        }

        _ => {}
    }

    Ok(())
}

/// Handles voice state updates while wrapping the functions in a Box
async fn on_voice_state_update(
    ctx: &serenity::prelude::Context,
    data: &BotData,
    old: Option<&serenity::VoiceState>,
    new: &serenity::VoiceState,
) -> Result<()> {
    Box::pin(async move {
        temp_voice::handle_voice_event(ctx, old, new, data).await?;
        temp_voice::handle_log_user_join(data, new).await?;
        leveling::handle_voice_leveling(ctx, old, new, data).await?;
        Ok::<(), Error>(())
    })
        .await?;
    Ok(())
}

/// Handles member join events while wrapping the functions in a Box
async fn on_member_join(
    ctx: &serenity::prelude::Context,
    data: &BotData,
    new_member: &serenity::Member,
) -> Result<()> {
    Box::pin(async move {
        raid_detection::handle_raid_detection(ctx, data, new_member).await?;
        join_leave::handle_member_join(ctx, new_member, data).await?;
        invite_tracking::store_member_invite(ctx, new_member, data).await?;
        Ok::<(), Error>(())
    })
        .await?;
    Ok(())
}

async fn on_message_delete(
    ctx: &serenity::prelude::Context,
    data: &BotData,
    channel_id: &serenity::ChannelId,
    deleted_message_id: &serenity::MessageId,
    guild_id: Option<&serenity::GuildId>,
) -> Result<(), anyhow::Error> {
    Box::pin(async move {
        starboard::handle_cleanup_if_starboard(ctx, &data.core.db, deleted_message_id).await?;
        message_logging::message_log_delete(ctx, *channel_id, *deleted_message_id, guild_id, data)
            .await
    })
        .await?;
    Ok(())
}

async fn on_message(
    ctx: &::serenity::prelude::Context,
    data: &BotData,
    new_message: &serenity::Message,
) -> Result<(), anyhow::Error> {
    Box::pin(async move {
        message_logging::spawn_cache_message_in_redis(data, new_message).await?;

        if automod::handle_automod(ctx, new_message, data).await? {
            return Ok::<(), Error>(());
        }

        tickets::handle_tickets(ctx, new_message, data).await?;
        leveling::handle_text_leveling(ctx, new_message, data).await?;
        custom_commands::handle_custom_cmd(ctx, new_message, data).await?;
        media_only::handle_media_channel_message(ctx, new_message, data).await?;
        Ok(())
    })
        .await?;
    Ok(())
}

/// Centralized helper to capture user names across events before dispatching.
///
/// Queues a `(user_id, username)` relation onto the shared username channel so
/// the background worker can persist it. Runs before the main dispatch so the
/// relation is recorded even if a later feature handler errors.
///
/// # Arguments
/// * `data` - Shared bot state.
/// * `event` - The gateway event to extract a user name from.
///
/// # Errors
/// Propagates any error raised while sending to the username channel.
async fn extract_and_store_username(data: &BotData, event: &FullEvent) -> Result<(), Error> {
    match event {
        FullEvent::Message { new_message } => {
            store_username_relation(
                &data.core.username_tx,
                new_message.author.id.get(),
                &new_message.author.name,
            )
                .await?;
        }
        FullEvent::MessageUpdate {
            old_if_available: Some(message),
            ..
        } => {
            store_username_relation(
                &data.core.username_tx,
                message.author.id.get(),
                &message.author.name,
            )
                .await?;
        }
        FullEvent::GuildMemberAddition { new_member } => {
            store_username_relation(
                &data.core.username_tx,
                new_member.user.id.get(),
                &new_member.user.name,
            )
                .await?;
        }
        FullEvent::GuildMemberRemoval { user, .. } => {
            store_username_relation(&data.core.username_tx, user.id.get(), &user.name).await?;
        }
        FullEvent::VoiceStateUpdate { old, new, .. } => {
            if let Some(member) = &new.member {
                store_username_relation(
                    &data.core.username_tx,
                    member.user.id.get(),
                    &member.user.name,
                )
                    .await?;
            }
            if let Some(member) = old.as_ref().and_then(|old| old.member.as_ref()) {
                store_username_relation(
                    &data.core.username_tx,
                    member.user.id.get(),
                    &member.user.name,
                )
                    .await?;
            }
        }
        FullEvent::InteractionCreate { interaction } => {
            let user = match interaction {
                serenity::Interaction::Command(command) => Some(&command.user),
                serenity::Interaction::Autocomplete(autocomplete) => Some(&autocomplete.user),
                serenity::Interaction::Component(component) => Some(&component.user),
                serenity::Interaction::Modal(modal) => Some(&modal.user),
                _ => None,
            };
            if let Some(user) = user {
                store_username_relation(&data.core.username_tx, user.id.get(), &user.name).await?;
            }
        }
        FullEvent::InviteCreate { data: invite_data } => {
            if let Some(inviter) = &invite_data.inviter {
                store_username_relation(&data.core.username_tx, inviter.id.get(), &inviter.name)
                    .await?;
            }
        }
        _ => {}
    }
    Ok(())
}
