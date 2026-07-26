use crate::events::interact::on_interact;
use crate::features::{automod, custom_commands, invite_tracking, join_leave, leveling, message_logging, reaction_roles, starboard, temp_voice, tickets};
use crate::shared::store_username_relation;
use crate::{Data, Error};
use poise::serenity_prelude as serenity;
use poise::serenity_prelude::FullEvent;

pub async fn dispatch_events(
    ctx: &serenity::Context,
    event: &FullEvent,
    _framework: poise::FrameworkContext<'_, Data, Error>,
    data: &Data,
) -> Result<(), Error> {
    extract_and_store_username(data, event).await?;

    match event {
        FullEvent::MessageDelete {
            channel_id,
            deleted_message_id,
            guild_id,
        } => {
            starboard::handle_cleanup_if_starboard(ctx, &data.db, deleted_message_id).await?;
            message_logging::message_log_delete(ctx, channel_id, deleted_message_id, guild_id, data).await?;
        }

        FullEvent::MessageUpdate {
            old_if_available,
            new,
            event,
        } => {
            message_logging::log_message_update(ctx, old_if_available.as_ref(), new.as_ref(), event, data).await?;
        }

        FullEvent::Message { new_message } => {
            message_logging::spawn_cache_message_in_redis(data, new_message).await?;

            if automod::handle_automod(ctx, new_message, data).await? {
                return Ok(());
            }

            tickets::handle_tickets(ctx, new_message, data).await?;
            leveling::handle_text_leveling(ctx, new_message, data).await?;
            custom_commands::handle_custom_cmd(ctx, new_message, data).await?;
        }

        FullEvent::GuildMemberAddition { new_member } => {
            join_leave::handle_member_join(ctx, new_member, data).await?;
            invite_tracking::store_member_invite(ctx, new_member, data).await?;
        }

        FullEvent::GuildMemberRemoval {
            guild_id,
            user,
            member_data_if_available,
        } => {
            join_leave::send_leave_message(ctx, guild_id, user, member_data_if_available, data).await?;
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
            temp_voice::handle_voice_event(ctx, old.as_ref(), new, data).await?;
            leveling::handle_voice_leveling(ctx, old.as_ref(), new, data).await?;
        }

        FullEvent::AutoModActionExecution { execution } => {
            automod::store_automod(ctx, execution, data).await?;
        }

        FullEvent::GuildCreate { guild, .. } => {
            invite_tracking::fetch_current_invites(ctx, guild, data).await?;
        }

        FullEvent::InviteCreate { data: invite_data } => {
            invite_tracking::store_invite(ctx, invite_data, data).await?;
        }

        FullEvent::InviteDelete { data: invite_data } => {
            invite_tracking::delete_invite(ctx, invite_data, data).await?;
        }

        FullEvent::AutoModRuleCreate { rule } => {
            automod::cache_automod_name(&data.redis, &rule.id, rule).await?;
        }
        FullEvent::AutoModRuleDelete { rule } => {
            automod::invalidate_rule_cache(&data.redis, &rule.id).await?;
        }
        FullEvent::AutoModRuleUpdate { rule } => {
            automod::cache_automod_name(&data.redis, &rule.id, rule).await?;
        }

        _ => {}
    }

    Ok(())
}


/// Centralized helper to capture user names across events before dispatching
async fn extract_and_store_username(data: &Data, event: &FullEvent) -> Result<(), Error> {
    match event {
        FullEvent::MessageUpdate { old_if_available, .. } => {
            if let Some(message) = old_if_available {
                store_username_relation(&data.db, &data.redis, message.author.id.get(), &message.author.name).await?;
            }
        }
        FullEvent::GuildMemberAddition { new_member } => {
            store_username_relation(&data.db, &data.redis, new_member.user.id.get(), &new_member.user.name).await?;
        }
        FullEvent::GuildMemberRemoval { user, .. } => {
            store_username_relation(&data.db, &data.redis, user.id.get(), &user.name).await?;
        }
        FullEvent::VoiceStateUpdate { new, .. } => {
            if let Some(member) = &new.member {
                store_username_relation(&data.db, &data.redis, member.user.id.get(), &member.user.name).await?;
            }
        }
        FullEvent::InviteCreate { data: invite_data } => {
            if let Some(inviter) = &invite_data.inviter {
                store_username_relation(&data.db, &data.redis, inviter.id.get(), &inviter.name).await?;
            }
        }
        _ => {}
    }
    Ok(())
}