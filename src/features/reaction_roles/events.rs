use super::database::{get_button_role, get_reaction_role};
use crate::core::config::state::{BotData, Error};
use poise::serenity_prelude as serenity;
use serenity::all::{
    ComponentInteraction, Context, CreateInteractionResponse, CreateInteractionResponseMessage,
    Reaction,
};
use tracing::{info, warn};

/// Assigns the configured role when a user reacts to a reaction role message.
///
/// # Errors
/// Returns an error if the reaction role lookup fails.
pub async fn handle_reaction_role_add(
    ctx: &Context,
    reaction: &Reaction,
    data: &BotData,
) -> Result<(), Error> {
    let Some(guild_id) = reaction.guild_id else {
        return Ok(());
    };
    let Some(user_id) = reaction.user_id else {
        return Ok(());
    };
    if user_id == ctx.cache.current_user().id {
        return Ok(());
    }

    let emoji_str = reaction.emoji.to_string();
    if let Some(role_id) = get_reaction_role(data, reaction.message_id, &emoji_str).await? {
        if let Err(err) = ctx
            .http
            .add_member_role(guild_id, user_id, role_id, Some("Reaction Role Add"))
            .await
        {
            warn!(
                "Failed to add role {} to user {}: {}",
                role_id, user_id, err
            );
        } else {
            info!("Assigned role {} to user {}", role_id, user_id);
        }
    }
    Ok(())
}

/// Removes the configured role when a user removes their reaction from a reaction role message.
///
/// # Errors
/// Returns an error if the reaction role lookup fails.
pub async fn handle_reaction_role_remove(
    ctx: &Context,
    reaction: &Reaction,
    data: &BotData,
) -> Result<(), Error> {
    let Some(guild_id) = reaction.guild_id else {
        return Ok(());
    };
    let Some(user_id) = reaction.user_id else {
        return Ok(());
    };
    if user_id == ctx.cache.current_user().id {
        return Ok(());
    }

    let emoji_str = reaction.emoji.to_string();
    if let Some(role_id) = get_reaction_role(data, reaction.message_id, &emoji_str).await? {
        if let Err(err) = ctx
            .http
            .remove_member_role(guild_id, user_id, role_id, Some("Reaction Role Remove"))
            .await
        {
            warn!(
                "Failed to remove role {} from user {}: {}",
                role_id, user_id, err
            );
        } else {
            info!("Removed role {} from user {}", role_id, user_id);
        }
    }
    Ok(())
}

/// Toggles the configured role for a user when they click a reaction role button.
///
/// # Errors
/// Returns an error if the button role lookup fails.
pub async fn handle_button_interaction(
    ctx: &Context,
    component: &ComponentInteraction,
    data: &BotData,
) -> Result<(), Error> {
    // Parse custom_id string into i64
    let custom_id = component.data.custom_id.as_str();

    let Some(guild_id) = component.guild_id else {
        return Ok(());
    };

    // Lookup role ID from Redis / DB
    let Some(role_id) = get_button_role(data, custom_id).await? else {
        return Ok(());
    };

    let user_id = component.user.id;

    // Check if member already has the role directly from component payload (0 HTTP requests!)
    let has_role = component
        .member
        .as_ref()
        .is_some_and(|member| member.roles.contains(&role_id));

    let response_content = if has_role {
        match ctx
            .http
            .remove_member_role(guild_id, user_id, role_id, Some("Button Role Remove"))
            .await
        {
            Ok(()) => {
                info!("Removed button role {} from user {}", role_id, user_id);
                format!("Removed the <@&{role_id}> role from you.")
            }
            Err(err) => {
                warn!(
                    "Failed to remove button role {} from user {}: {}",
                    role_id, user_id, err
                );
                "Failed to remove role. Please check my bot role permissions.".to_string()
            }
        }
    } else {
        match ctx
            .http
            .add_member_role(guild_id, user_id, role_id, Some("Button Role Add"))
            .await
        {
            Ok(()) => {
                info!("Assigned button role {} to user {}", role_id, user_id);
                format!("Gave you the <@&{role_id}> role!")
            }
            Err(err) => {
                warn!(
                    "Failed to add button role {} to user {}: {}",
                    role_id, user_id, err
                );
                "Failed to add role. Please check my bot role permissions.".to_string()
            }
        }
    };

    // Send ephemeral response to user
    component
        .create_response(
            &ctx.http,
            CreateInteractionResponse::Message(
                CreateInteractionResponseMessage::new()
                    .content(response_content)
                    .ephemeral(true),
            ),
        )
        .await?;

    Ok(())
}
