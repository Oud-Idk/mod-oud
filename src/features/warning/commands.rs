#![allow(missing_docs)]
use crate::core::config::state::{Context, Error};
use crate::features::moderation::pre_flight_check;
use crate::features::warning::database::{fetch_warnings, search_warning_from_id, search_warnings_by_pattern};
use crate::features::warning::issuing::{issue_delete_warning, issue_warning};
use crate::features::warning::modify_warns::set_warning_active_status;
use crate::features::warning::pagination;
use crate::shared::command_context::GuildMetadata;
use crate::shared::messages::send_ephemeral;
use serenity::all::{Member, User};

/// Warns a user in the server.
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

    let Some(meta) = pre_flight_check(&ctx, member.user.id, "warn").await? else {
        return Ok(());
    };

    let reason_str = reason.unwrap_or_else(|| "No reason specified".to_string());

    issue_warning(
        &ctx.data().core.db,
        &ctx.data().core.redis,
        &ctx.data().core.guild_configs_cache,
        &ctx.data().core.username_tx,
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
            .content(format!("Successfully warned {} for: {}", member.user.name, reason_str))
            .ephemeral(true),
    ).await?;

    Ok(())
}

// ==========================================
// 2. TOP-LEVEL MANAGEMENT GROUP (`/warnings`)
// ==========================================

/// Parent command for viewing and managing warnings.
#[poise::command(
    slash_command,
    default_member_permissions = "MODERATE_MEMBERS",
    guild_only,
    subcommands(
        "history",
        "search",
        "view",
        "pardon",
        "unpardon",
        "delete"
    )
)]
pub async fn warnings(_: Context<'_>) -> Result<(), Error> {
    Ok(())
}

/// Shows the warning history of a user.
#[poise::command(slash_command)]
pub async fn history(
    ctx: Context<'_>,
    #[description = "The member to check"] member: Member,
) -> Result<(), Error> {
    ctx.defer_ephemeral().await?;
    let target_id = member.user.id.get();

    let meta = GuildMetadata::extract(&ctx)?;
    let records = fetch_warnings(&ctx.data().core.db, meta.id.get(), target_id as i64).await?;

    if records.is_empty() {
        send_ephemeral(&ctx, format!("<@{}> has no active warnings.", member.user.id)).await?;
        return Ok(());
    }

    let title = format!("Warning History for {}", member.user.name);
    let avatar_url = Some(member.user.face());

    pagination::paginate_warnings(ctx, &records, title, avatar_url).await?;
    Ok(())
}

/// Search warnings by description or reason.
#[poise::command(slash_command)]
pub async fn search(
    ctx: Context<'_>,
    #[description = "Text to search for in warning reasons"] query: String,
    #[description = "Filter results to a specific user"] user: Option<User>,
) -> Result<(), Error> {
    let target_user_id = user.as_ref().map(|u| u.id.get());
    let meta = GuildMetadata::extract(&ctx)?;

    let search_pattern = format!("%{query}%");
    let records = search_warnings_by_pattern(
        &ctx.data().core.db,
        meta.id.get(),
        target_user_id.map(|id| id as i64),
        &search_pattern,
    ).await?;

    if records.is_empty() {
        let filter_message = match user {
            Some(u) => format!("issued to <@{}> ", u.id),
            None => String::new(),
        };
        send_ephemeral(
            &ctx,
            format!("No warnings {filter_message}found matching `{query}`."),
        ).await?;
        return Ok(());
    }

    let title = format!("Search Results for \"{query}\"");
    let avatar_url = user.as_ref().map(serenity::all::User::face);

    pagination::paginate_warnings(ctx, &records, title, avatar_url).await?;
    Ok(())
}

/// Look up a specific warning by its ID.
#[poise::command(slash_command)]
pub async fn view(
    ctx: Context<'_>,
    #[description = "The ID of the warning to look up"] id: i64,
) -> Result<(), Error> {
    let meta = GuildMetadata::extract(&ctx)?;
    let record = search_warning_from_id(&ctx.data().core.db, meta.id.get(), id).await;

    match record {
        Some(warn) => {
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
            send_ephemeral(&ctx, format!("Could not find warning with ID **#{id}** in this server.")).await?;
        }
    }

    Ok(())
}

/// Pardons a warning (deactivates it).
#[poise::command(slash_command)]
pub async fn pardon(
    ctx: Context<'_>,
    #[description = "The warning ID"] id: i64,
) -> Result<(), Error> {
    ctx.defer_ephemeral().await?;
    set_warning_active_status(ctx, id, false).await
}

/// Reactivates a pardoned warning.
#[poise::command(slash_command)]
pub async fn unpardon(
    ctx: Context<'_>,
    #[description = "The warning ID"] id: i64,
) -> Result<(), Error> {
    ctx.defer_ephemeral().await?;
    set_warning_active_status(ctx, id, true).await
}

/// Permanently deletes a warning record from the database.
#[poise::command(slash_command, default_member_permissions = "ADMINISTRATOR")]
pub async fn delete(
    ctx: Context<'_>,
    #[description = "The warning ID"] id: i64,
) -> Result<(), Error> {
    ctx.defer_ephemeral().await?;
    let meta = GuildMetadata::extract(&ctx)?;

    let result = issue_delete_warning(
        &ctx.data().core.db,
        &ctx.data().core.redis,
        &ctx.data().core.guild_configs_cache,
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
                    "**Warning #{id}** for <@{target_user_id}> has been permanently deleted.\n**Original Reason:** {reason}"
                ),
            ).await?;
        }
        None => {
            send_ephemeral(
                &ctx,
                format!("Could not find a warning with ID **#{id}** in this server."),
            ).await?;
        }
    }

    Ok(())
}