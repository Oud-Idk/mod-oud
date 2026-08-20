use crate::core::config::state::{Context, Error};
use crate::shared::command_context::GuildMetadata;
use anyhow::{Context as _, Result, bail};
use serenity::all::{Member, Role, RoleId, UserId};
use std::collections::HashMap;
use tracing::{debug, trace, warn};

/// Runs pre-flight permission checks (self-moderation, role hierarchy) before
/// a moderation action and returns the guild metadata on success.
///
/// # Errors
/// Returns an error if the guild metadata cannot be extracted or a permission
/// check fails to complete.
pub async fn pre_flight_check(
    ctx: Context<'_>,
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

    if let Err(err_msg) = check_hierarchy(ctx, user_id).await {
        debug!(
            target_id,
            error = %err_msg,
            action = action_name,
            "Moderation action blocked by role hierarchy validation"
        );
        ctx.say(format!("❌ Action Denied: {err_msg}")).await?;
        return Ok(None);
    }

    trace!(
        target_id,
        "Moderation pre-flight checks completed successfully"
    );
    Ok(Some(GuildMetadata::extract(&ctx)?))
}

/// Returns `true` (and sends a message) if the author is trying to moderate
/// themselves.
pub async fn check_self_moderation(
    ctx: Context<'_>,
    target_id: UserId,
    action: &str,
) -> Result<bool, Error> {
    if ctx.author().id == target_id {
        debug!(
            author_id = ctx.author().id.get(),
            action, "Self-moderation attempt detected and blocked"
        );
        ctx.send(
            poise::CreateReply::default()
                .content(format!("You cannot {action} yourself!"))
                .ephemeral(true),
        )
        .await?;
        return Ok(true);
    }
    Ok(false)
}

/// Main entry point to perform Discord hierarchy validation checks.
pub async fn check_hierarchy(ctx: Context<'_>, target_id: UserId) -> Result<(), Error> {
    trace!(%target_id, "Evaluating role hierarchy permissions");

    let guild_id = ctx
        .guild_id()
        .with_context(|| "This command must be run in a server.")?;

    // Extract owner_id & roles and DROP the GuildRef immediately so no raw pointer crosses an .await
    let (owner_id, roles) = if let Some(guild) = ctx.guild() {
        (guild.owner_id, guild.roles.clone())
    } else {
        let partial = guild_id.to_partial_guild(&ctx).await?;
        (partial.owner_id, partial.roles)
    };

    if target_id == owner_id {
        bail!("Cannot perform moderation actions on the server owner.");
    }

    // Check cache for members (temporary GuildRef is dropped at the end of each statement)
    let bot_id = ctx.framework().bot_id;
    let cached_target = ctx
        .cache()
        .guild(guild_id)
        .and_then(|g| g.members.get(&target_id).cloned());

    let cached_bot = ctx
        .cache()
        .guild(guild_id)
        .and_then(|g| g.members.get(&bot_id).cloned());

    // Fetch missing members concurrently with tokio::join!
    let (target_res, executor_res, bot_res) = tokio::join!(
        async {
            if let Some(member) = cached_target {
                Ok(member)
            } else {
                guild_id.member(&ctx, target_id).await
            }
        },
        ctx.author_member(),
        async {
            if let Some(member) = cached_bot {
                Ok(member)
            } else {
                guild_id.member(&ctx, bot_id).await
            }
        }
    );

    // If target is not currently in the server (e.g. banning an un-joined user), skip hierarchy check
    let Ok(target_member) = target_res else {
        debug!(
            %target_id,
            "Target is not a member of the guild; skipping role hierarchy checks"
        );
        return Ok(());
    };

    let executor_member = executor_res
        .with_context(|| "Failed to fetch executor member details.")
        .inspect_err(|_a| {
            warn!(
                %target_id,
                "Failed to resolve executor member details from context"
            );
        })?;

    let bot_member = bot_res.with_context(|| "Failed to fetch bot member details.")?;

    let executor_pos = get_highest_role_pos(&executor_member, &roles);
    let target_pos = get_highest_role_pos(&target_member, &roles);
    let bot_pos = get_highest_role_pos(&bot_member, &roles);

    trace!(
        %target_id,
        executor_pos, target_pos, bot_pos, "Comparing highest role positions"
    );

    validate_hierarchy(ctx.author().id, owner_id, executor_pos, target_pos, bot_pos).inspect_err(
        |err| {
            debug!(
                %target_id,
                error = %err,
                executor_pos,
                target_pos,
                bot_pos,
                "Hierarchy validation rule violated"
            );
        },
    )
}

/// Calculates the highest role position of a member.
/// Falls back to 0 (the default position of the @everyone role) if no other roles exist.
pub fn get_highest_role_pos(member: &Member, roles: &HashMap<RoleId, Role>) -> u16 {
    member
        .roles
        .iter()
        .filter_map(|role_id| roles.get(role_id))
        .map(|role| role.position)
        .max()
        .unwrap_or(0)
}

/// A pure business logic function to validate hierarchy positions.
/// This can be easily unit-tested with dummy values.
pub fn validate_hierarchy(
    executor_id: UserId,
    owner_id: UserId,
    executor_pos: u16,
    target_pos: u16,
    bot_pos: u16,
) -> Result<()> {
    // If the executor is the server owner, they bypass executor hierarchy checks.
    if executor_id == owner_id {
        if bot_pos <= target_pos {
            bail!(
                "I cannot moderate this user because their highest role is equal to or higher than mine."
            );
        }
        return Ok(());
    }

    // Normal executor hierarchy check
    if executor_pos <= target_pos {
        bail!(
            "You cannot moderate this user because their highest role is equal to or higher than yours."
        );
    }

    // Bot hierarchy check
    if bot_pos <= target_pos {
        bail!(
            "I cannot moderate this user because their highest role is equal to or higher than mine."
        );
    }

    Ok(())
}
