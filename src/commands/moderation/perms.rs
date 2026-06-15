use crate::commands::helpers::dm::GuildMetadata;
use crate::commands::moderation::utils;
use crate::types::types::{Context, Data, Error};
use poise::serenity_prelude as serenity;
use serenity::all::UserId;

pub async fn pre_flight_check<'a>(
    ctx: &Context<'a>,
    user_id: serenity::UserId,
    action_name: &str,
) -> Result<Option<GuildMetadata>, Error> {
    if check_self_moderation(ctx, user_id, action_name).await? {
        return Ok(None);
    }

    if let Err(err_msg) = check_hierarchy(*ctx, user_id).await {
        ctx.say(format!("❌ Action Denied: {}", err_msg)).await?;
        return Ok(None);
    }

    // If they passed the vibe check, hand over the metadata
    Ok(Some(GuildMetadata::extract(ctx)?))
}

pub async fn check_self_moderation(
    ctx: &Context<'_>,
    target_id: serenity::UserId,
    action: &str,
) -> Result<bool, Error> {
    if ctx.author().id == target_id {
        ctx.send(
            poise::CreateReply::default()
                .content(format!("You cannot {} yourself!", action))
                .ephemeral(true),
        )
            .await?;
        return Ok(true);
    }
    Ok(false)
}

/// Main entry point to perform Discord hierarchy validation checks.
pub async fn check_hierarchy(
    ctx: poise::Context<'_, Data, Error>,
    target_id: UserId,
) -> Result<(), Error> {
    let guild_id = ctx
        .guild_id()
        .ok_or("This command must be run in a server.")?;

    let guild = guild_id.to_partial_guild(&ctx).await?;

    if target_id == guild.owner_id {
        return Err("Cannot perform moderation actions on the server owner.".into());
    }

    // If the target is not currently in the server (e.g., we are banning a user who left),
    // they don't have roles in the guild, so we can skip role hierarchy checks.
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

    let executor_pos = utils::get_highest_role_pos(&executor_member, &guild);
    let target_pos = utils::get_highest_role_pos(&target_member, &guild);
    let bot_pos = utils::get_highest_role_pos(&bot_member, &guild);

    utils::validate_hierarchy(
        ctx.author().id,
        guild.owner_id,
        executor_pos,
        target_pos,
        bot_pos,
    )
        .map_err(Into::into)
}