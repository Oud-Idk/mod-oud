use super::database::get_reaction_role;
use crate::{Data, Error};
use poise::serenity_prelude as serenity;
use serenity::all::{Context, Reaction};
use tracing::{info, warn};

pub async fn handle_reaction_role_add(ctx: &Context, reaction: &Reaction, data: &Data) -> Result<(), Error> {
    let Some(guild_id) = reaction.guild_id else { return Ok(()); };
    let Some(user_id) = reaction.user_id else { return Ok(()); };
    if user_id == ctx.cache.current_user().id {
        return Ok(());
    }

    let emoji_str = reaction.emoji.to_string();
    if let Some(role_id) = get_reaction_role(data, reaction.message_id.get() as i64, &emoji_str).await? {
        if let Err(err) = ctx.http.add_member_role(guild_id, user_id, role_id, Some("Reaction Role Add")).await {
            warn!("Failed to add role {} to user {}: {}", role_id, user_id, err);
        } else {
            info!("Assigned role {} to user {}", role_id, user_id);
        }
    }
    Ok(())
}

pub async fn handle_reaction_role_remove(ctx: &Context, reaction: &Reaction, data: &Data) -> Result<(), Error> {
    let Some(guild_id) = reaction.guild_id else { return Ok(()); };
    let Some(user_id) = reaction.user_id else { return Ok(()); };
    if user_id == ctx.cache.current_user().id {
        return Ok(());
    }

    let emoji_str = reaction.emoji.to_string();
    if let Some(role_id) = get_reaction_role(data, reaction.message_id.get() as i64, &emoji_str).await? {
        if let Err(err) = ctx.http.remove_member_role(guild_id, user_id, role_id, Some("Reaction Role Remove")).await {
            warn!("Failed to remove role {} from user {}: {}", role_id, user_id, err);
        } else {
            info!("Removed role {} from user {}", role_id, user_id);
        }
    }
    Ok(())
}