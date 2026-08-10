use anyhow::{anyhow, Context as _, Result, bail};
use crate::shared::command_context::GuildMetadata;
use crate::{Context, Data, Error};
use serenity::all::{Member, PartialGuild, UserId};
use tracing::{debug, trace, warn};

pub async fn pre_flight_check<'a>(
    ctx: &Context<'a>,
    user_id: UserId,
    action_name: &str,
) -> Result<Option<GuildMetadata>, Error> {
    let target_id = user_id.get();
    trace!(
        target_id,
        action = action_name,
        "Initiating moderation pre-flight checks"
    );

    if check_self_moderation(ctx, user_id, action_name).await? {
        return Ok(None);
    }

    if let Err(err_msg) = check_hierarchy(*ctx, user_id).await {
        debug!(
            target_id,
            error = %err_msg,
            action = action_name,
            "Moderation action blocked by role hierarchy validation"
        );
        ctx.say(format!("❌ Action Denied: {}", err_msg)).await?;
        return Ok(None);
    }

    trace!(target_id, "Moderation pre-flight checks completed successfully");
    Ok(Some(GuildMetadata::extract(ctx)?))
}

pub async fn check_self_moderation(
    ctx: &Context<'_>,
    target_id: UserId,
    action: &str,
) -> Result<bool, Error> {
    if ctx.author().id == target_id {
        debug!(
            author_id = ctx.author().id.get(),
            action,
            "Self-moderation attempt detected and blocked"
        );
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
    let target_uid = target_id.get();
    trace!(target_uid, "Evaluating role hierarchy permissions");

    let guild_id = ctx
        .guild_id()
        .with_context(|| "This command must be run in a server.")?;

    let guild = guild_id.to_partial_guild(&ctx).await?;

    if target_id == guild.owner_id {
        debug!(target_uid, "Hierarchy check failed: target is the server owner");
        bail!("Cannot perform moderation actions on the server owner.");
    }

    // If the target is not currently in the server (e.g., we are banning a user who left),
    // they don't have roles in the guild, so we can skip role hierarchy checks.
    let target_member = match guild_id.member(&ctx, target_id).await {
        Ok(member) => member,
        Err(_) => {
            debug!(
                target_uid,
                "Target is not a member of the guild; skipping role hierarchy checks"
            );
            return Ok(());
        }
    };

    let executor_member = ctx
        .author_member()
        .await
        .with_context(|| "Failed to fetch executor member details.")
        .inspect_err(|a| {
            warn!(target_uid, "Failed to resolve executor member details from context");
        })?;

    let bot_id = ctx.framework().bot_id;
    let bot_member = guild_id.member(&ctx, bot_id).await?;

    let executor_pos = get_highest_role_pos(&executor_member, &guild);
    let target_pos = get_highest_role_pos(&target_member, &guild);
    let bot_pos = get_highest_role_pos(&bot_member, &guild);

    trace!(
        target_uid,
        executor_pos,
        target_pos,
        bot_pos,
        "Comparing highest role positions"
    );

    validate_hierarchy(
        ctx.author().id,
        guild.owner_id,
        executor_pos,
        target_pos,
        bot_pos,
    )
        .inspect_err(|err|
            debug!(
            target_uid,
            error = %err,
            executor_pos,
            target_pos,
            bot_pos,
            "Hierarchy validation rule violated"
        ))
}

/// Calculates the highest role position of a member.
/// Falls back to 0 (the default position of the @everyone role) if no other roles exist.
pub fn get_highest_role_pos(member: &Member, guild: &PartialGuild) -> i16 {
    member
        .roles
        .iter()
        .filter_map(|role_id| guild.roles.get(role_id))
        .map(|role| role.position)
        .max()
        .unwrap_or(0) as i16
}

/// A pure business logic function to validate hierarchy positions.
/// This can be easily unit-tested with dummy values.
pub fn validate_hierarchy(
    executor_id: UserId,
    owner_id: UserId,
    executor_pos: i16,
    target_pos: i16,
    bot_pos: i16,
) -> Result<()> {
    // If the executor is the server owner, they bypass executor hierarchy checks.
    if executor_id == owner_id {
        if bot_pos <= target_pos {
            bail!("I cannot moderate this user because their highest role is equal to or higher than mine.");
        }
        return Ok(());
    }

    // Normal executor hierarchy check
    if executor_pos <= target_pos {
        bail!("You cannot moderate this user because their highest role is equal to or higher than yours.");
    }

    // Bot hierarchy check
    if bot_pos <= target_pos {
        bail!("I cannot moderate this user because their highest role is equal to or higher than mine.");
    }

    Ok(())
}