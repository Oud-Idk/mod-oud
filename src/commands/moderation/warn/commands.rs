use crate::commands::moderation::perms::pre_flight_check;
use crate::commands::moderation::utils::send_ephemeral;
use crate::commands::moderation::warn::database::{fetch_warnings, search_warning_from_id, search_warnings_by_pattern};
use crate::commands::moderation::warn::modify_warns::set_warning_active_status;
use crate::commands::moderation::warn::paginate;
use crate::types::{Context, Error, GuildMetadata};
use crate::utils::moderation::actions::{issue_delete_warning, issue_warning};
use poise::serenity_prelude as serenity;
use serenity::all::{Member, User};
use tracing::{debug, info, trace};

/// Warns a user.
#[poise::command(
    slash_command,
    default_member_permissions = "MODERATE_MEMBERS",
    guild_only
)]
pub async fn warn(
    ctx: Context<'_>,
    #[description = "The member to warn"] member: Member,
    #[description = "The reason"] reason: Option<String>,
) -> Result<(), Error> {
    ctx.defer_ephemeral().await?;
    let target_id = member.user.id.get();
    info!(
        caller_id = ctx.author().id.get(),
        target_id,
        "Invoked warn command"
    );

    let Some(meta) = pre_flight_check(&ctx, member.user.id, "warn").await? else {
        debug!(target_id, "Warn pre-flight permissions check failed");
        return Ok(());
    };

    let reason_str = reason.unwrap_or_else(|| "No reason specified".to_string());

    issue_warning(
        &ctx.data().db,
        &ctx.data().redis,
        &ctx.data().guild_configs,
        &ctx.serenity_context().http,
        meta.id,
        member.user.id,
        meta.author_id,
        &reason_str,
        &ctx.author().name,
        &member.user.name,
    ).await?;

    ctx.send(
        poise::CreateReply::default()
            .content(format!("Successfully warned {} for: {}", member.user.name, &reason_str))
            .ephemeral(true),
    ).await?;

    info!(target_id, "User successfully warned");
    Ok(())
}

/// Shows the history of warns of a user.
#[poise::command(
    slash_command,
    default_member_permissions = "MODERATE_MEMBERS",
    guild_only
)]
pub async fn warn_history(
    ctx: Context<'_>,
    #[description = "The member to check"] member: Member,
) -> Result<(), Error> {
    ctx.defer_ephemeral().await?;
    let target_id = member.user.id.get();
    info!(
        caller_id = ctx.author().id.get(),
        target_id,
        "Invoked warn_history command"
    );

    let meta = GuildMetadata::extract(&ctx)?;
    let db = &ctx.data().db;

    let warnings = fetch_warnings(db, meta.id.get() as i64, target_id as i64).await?;

    if warnings.is_empty() {
        debug!(target_id, "No active warnings found for user");
        send_ephemeral(&ctx, format!("<@{}> has no active warnings.", member.user.id)).await?;
        return Ok(());
    }

    trace!(target_id, count = warnings.len(), "Paginating warning history results");
    let title = format!("Warning History for {}", member.user.name);
    let avatar_url = Some(member.user.face());

    paginate::paginate_warnings(ctx, &warnings, title, avatar_url).await?;

    Ok(())
}

/// Search warnings by description/reason.
#[poise::command(
    slash_command,
    default_member_permissions = "MODERATE_MEMBERS",
    guild_only
)]
pub async fn search_warnings(
    ctx: Context<'_>,
    #[description = "The text to search for in warning reasons"] query: String,
    #[description = "Filter results to a specific user"] user: Option<User>,
) -> Result<(), Error> {
    let target_user_id = user.as_ref().map(|u| u.id.get());
    info!(
        caller_id = ctx.author().id.get(),
        query,
        target_user_id,
        "Invoked search_warnings command"
    );

    let meta = GuildMetadata::extract(&ctx)?;
    let db = &ctx.data().db;

    let search_pattern = format!("%{}%", query);
    let warnings = search_warnings_by_pattern(
        db,
        meta.id.get() as i64,
        target_user_id.map(|id| id as i64),
        &search_pattern,
    ).await?;

    if warnings.is_empty() {
        debug!(query, target_user_id, "No warnings matched the search criteria");
        let filter_message = match user {
            Some(u) => format!("issued to <@{}> ", u.id),
            None => String::new(),
        };
        send_ephemeral(
            &ctx,
            format!("No warnings {}found matching `{}`.", filter_message, query),
        ).await?;
        return Ok(());
    }

    trace!(query, count = warnings.len(), "Paginating pattern search results");
    let title = format!("Search Results for \"{}\"", query);
    let avatar_url = user.as_ref().map(|u| u.face());

    paginate::paginate_warnings(ctx, &warnings, title, avatar_url).await?;

    Ok(())
}

/// Search for a specific warning by its ID.
#[poise::command(
    slash_command,
    default_member_permissions = "MODERATE_MEMBERS",
    guild_only
)]
pub async fn search_warning_by_id(
    ctx: Context<'_>,
    #[description = "The ID of the warning to look up"] id: i64,
) -> Result<(), Error> {
    info!(
        caller_id = ctx.author().id.get(),
        warning_id = id,
        "Invoked search_warning_by_id command"
    );

    let meta = GuildMetadata::extract(&ctx)?;
    let db = &ctx.data().db;

    let record = search_warning_from_id(db, meta.id.get() as i64, id).await;

    match record {
        Some(warn) => {
            trace!(warning_id = id, "Warning detail retrieved successfully");
            let status = if warn.is_active.unwrap_or(true) { "Active" } else { "Pardoned" };
            let time_str = match warn.created_at {
                Some(dt) => format!("<t:{0}:f> (<t:{0}:R>)", dt.timestamp()),
                None => "*Unknown date*".to_string(),
            };
            let reason = warn.reason.as_deref().unwrap_or("*No reason provided*");

            let embed = poise::serenity_prelude::CreateEmbed::new()
                .title(format!("Warning Details — ID: `{}`", warn.id))
                .color(0x5865F2)
                .field("User", format!("<@{}>", warn.user_id), true)
                .field("Moderator", format!("<@{}>", warn.moderator_id), true)
                .field("Status", status, true)
                .field("Date", time_str, false)
                .field("Reason", reason, false);

            ctx.send(poise::CreateReply::default().embed(embed).ephemeral(true)).await?;
        }
        None => {
            debug!(warning_id = id, "Warning details search returned empty");
            send_ephemeral(&ctx, format!("Could not find warning with ID **#{}** in this server.", id)).await?;
        }
    }

    Ok(())
}

/// Completely deletes a warning from the database. If you want to pardon, use /pardon instead.
#[poise::command(
    slash_command,
    default_member_permissions = "ADMINISTRATOR",
    guild_only
)]
pub async fn delete_warning(
    ctx: Context<'_>,
    #[description = "The warning ID"] id: i64,
) -> Result<(), Error> {
    info!(
        caller_id = ctx.author().id.get(),
        warning_id = id,
        "Invoked delete_warning command"
    );

    ctx.defer_ephemeral().await?;
    let meta = GuildMetadata::extract(&ctx)?;

    let result = issue_delete_warning(
        &ctx.data().db,
        &ctx.data().redis,
        &ctx.data().guild_configs,
        &ctx.serenity_context().http,
        meta.id,
        id,
        ctx.author(),
    ).await?;

    match result {
        Some((target_user_id, reason)) => {
            send_ephemeral(
                &ctx,
                format!(
                    "**Warning #{}** for <@{}> has been permanently deleted.\n**Original Reason:** {}",
                    id, target_user_id, reason
                ),
            ).await?;

            info!(
                warning_id = id,
                target_user_id,
                "Warning record permanently deleted from the database"
            );
        }
        None => {
            debug!(warning_id = id, "Delete warning failed: ID not found in database");
            send_ephemeral(
                &ctx,
                format!("Could not find a warning with ID **#{}** in this server.", id),
            ).await?;
        }
    }

    Ok(())
}

/// Pardons a warning.
#[poise::command(
    slash_command,
    default_member_permissions = "MODERATE_MEMBERS",
    guild_only
)]
pub async fn pardon_warning(
    ctx: Context<'_>,
    #[description = "The warning ID"] id: i64,
) -> Result<(), Error> {
    info!(
        caller_id = ctx.author().id.get(),
        warning_id = id,
        "Invoked pardon_warning command"
    );
    ctx.defer_ephemeral().await?;
    set_warning_active_status(ctx, id, false).await
}

/// Unpardons a warning.
#[poise::command(
    slash_command,
    default_member_permissions = "MODERATE_MEMBERS",
    guild_only
)]
pub async fn unpardon_warning(
    ctx: Context<'_>,
    #[description = "The warning ID"] id: i64,
) -> Result<(), Error> {
    info!(
        caller_id = ctx.author().id.get(),
        warning_id = id,
        "Invoked unpardon_warning command"
    );
    ctx.defer_ephemeral().await?;
    set_warning_active_status(ctx, id, true).await
}