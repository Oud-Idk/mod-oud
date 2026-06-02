use crate::types::{Data, Error};
use poise::serenity_prelude as serenity;
use serenity::all::UserId;

pub async fn check_hierarchy(
    ctx: poise::Context<'_, Data, Error>,
    target_id: UserId,
) -> Result<(), Error> {
    let guild_id = ctx
        .guild_id()
        .ok_or("This command must be run in a server.")?;

    // Fetch the partial guild to access the roles list
    let guild = guild_id.to_partial_guild(&ctx).await?;

    // If the target is the owner, deny immediately
    if target_id == guild.owner_id {
        return Err("Cannot perform moderation actions on the server owner.".into());
    }

    // Fetch the target member. If they are not in the guild, hierarchy checks are skipped (e.g., hackbans)
    let target_member = match guild_id.member(&ctx, target_id).await {
        Ok(member) => member,
        Err(_) => return Ok(()),
    };

    let executor_member = ctx
        .author_member()
        .await
        .ok_or("Failed to fetch executor member details.")?;

    let bot_id = ctx.framework().bot_id;
    let bot_member = guild_id.member(&ctx, bot_id).await?;

    // Helper closure to calculate the highest role position of a member
    let get_highest_role_pos = |member: &serenity::Member| -> i16 {
        member
            .roles
            .iter()
            .filter_map(|role_id| guild.roles.get(role_id))
            .map(|role| role.position)
            .max()
            .unwrap_or(0) as i16 // Default position of @everyone is 0
    };

    let executor_pos = get_highest_role_pos(&executor_member);
    let target_pos = get_highest_role_pos(&target_member);
    let bot_pos = get_highest_role_pos(&bot_member);

    // If the executor is the guild owner, they bypass hierarchy limits (but the bot must still be higher)
    if ctx.author().id == guild.owner_id {
        if bot_pos <= target_pos {
            return Err("I cannot moderate this user because their highest role is equal to or higher than mine.".into());
        }
        return Ok(());
    }

    // Ensure the executor is higher than the target
    if executor_pos <= target_pos {
        return Err("You cannot moderate this user because their highest role is equal to or higher than yours.".into());
    }

    // Ensure the bot is higher than the target
    if bot_pos <= target_pos {
        return Err("I cannot moderate this user because their highest role is equal to or higher than mine.".into());
    }

    Ok(())
}
