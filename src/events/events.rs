use crate::events::handlers::automod::cache::{cache_automod_name, invalidate_rule_cache};
use crate::events::handlers::automod::on_automod;
use crate::events::handlers::join_leave::{on_member_join, on_member_leave};
use crate::events::interact::on_interact;
use crate::events::message::{on_message, on_message_delete, on_message_update, on_reaction_add, on_reaction_remove};
use crate::events::voice::on_voice_state_update;
use crate::types::{Data, Error};
use poise::serenity_prelude as serenity;
use poise::serenity_prelude::FullEvent;

pub async fn event_handler(
    ctx: &serenity::Context,
    event: &FullEvent,
    _framework: poise::FrameworkContext<'_, Data, Error>,
    data: &Data,
) -> Result<(), Error> {
    match event {
        FullEvent::MessageDelete {
            channel_id,
            deleted_message_id,
            guild_id,
        } => {
            on_message_delete(ctx, channel_id, deleted_message_id, guild_id, data).await?;
        }
        FullEvent::MessageUpdate {
            old_if_available,
            new,
            event,
        } => {
            on_message_update(ctx, old_if_available.as_ref(), new.as_ref(), event, data).await?;
        }
        FullEvent::Message { new_message } => {
            on_message(ctx, new_message, data).await?;
        }
        FullEvent::GuildMemberAddition { new_member } => {
            on_member_join(ctx, new_member, data).await?;
        }
        FullEvent::GuildMemberRemoval {
            guild_id,
            user,
            member_data_if_available,
        } => {
            on_member_leave(ctx, guild_id, user, member_data_if_available, data).await?;
        }
        FullEvent::InteractionCreate { interaction } => {
            on_interact(ctx, interaction, data).await?;
        }
        FullEvent::ReactionAdd { add_reaction } => {
            on_reaction_add(ctx, add_reaction, data).await?;
        }
        FullEvent::ReactionRemove { removed_reaction } => {
            on_reaction_remove(ctx, removed_reaction, data).await?;
        }
        FullEvent::VoiceStateUpdate { old, new } => {
            on_voice_state_update(ctx, old.as_ref(), new, data).await?;
        }
        FullEvent::AutoModActionExecution { execution } => {
            on_automod(ctx, execution, data).await?;
        }
        FullEvent::AutoModRuleCreate { rule } => { cache_automod_name(&data.redis, &rule.id, &rule).await?; }
        FullEvent::AutoModRuleDelete { rule } => { invalidate_rule_cache(&data.redis, &rule.id).await?; }
        FullEvent::AutoModRuleUpdate { rule } => { cache_automod_name(&data.redis, &rule.id, &rule).await?; }
        _ => {}
    }
    Ok(())
}
