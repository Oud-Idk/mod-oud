use crate::types::types::{Context, Error};
use crate::utils::logger::{log_moderation_action, ActionType};
use crate::utils::moderating::issue_warning;
use futures::StreamExt;
use poise::serenity_prelude as serenity;
use serenity::model::guild::Member;
use serenity::model::user::User;

/// Intermediate representation of warning data used for unified display.
struct WarningInfo {
    id: i32,
    user_id: i64,
    moderator_id: i64,
    reason: Option<String>,
    timestamp: Option<i64>,
    is_active: Option<bool>,
}

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
    let author = ctx.author();

    if author.id == member.user.id {
        ctx.send(
            poise::CreateReply::default()
                .content("You cannot warn yourself!")
                .ephemeral(true),
        )
            .await?;
        return Ok(());
    }

    let reason_str = reason.unwrap_or_else(|| "No reason specified".to_string());

    issue_warning(
        &ctx.data().db,
        &ctx.data().redis,
        &ctx.serenity_context().http,
        ctx.guild_id().unwrap(),
        member.user.id,
        ctx.author().id,
        &reason_str,
    ).await?;

    ctx.send(
        poise::CreateReply::default()
            .content(format!("Successfully warned {} for: {}", member.user.name, &reason_str))
            .ephemeral(true),
    ).await?;

    Ok(())
}

/// Helper to handle paginated embeds with interactive button controls.
async fn paginate<F>(ctx: Context<'_>, total_pages: usize, make_embed: F) -> Result<(), Error>
where
    F: Fn(usize) -> poise::serenity_prelude::CreateEmbed + Send + Sync,
{
    if total_pages == 0 {
        return Ok(());
    }

    // Unique custom IDs to prevent collisions with other active pagination commands
    let prev_id = format!("{}_prev", ctx.id());
    let next_id = format!("{}_next", ctx.id());

    // Helper to generate buttons based on current page status
    let make_components = |page_idx: usize| {
        let prev_btn = poise::serenity_prelude::CreateButton::new(&prev_id)
            .label("◀")
            .style(poise::serenity_prelude::ButtonStyle::Primary)
            .disabled(page_idx == 0);

        let next_btn = poise::serenity_prelude::CreateButton::new(&next_id)
            .label("▶")
            .style(poise::serenity_prelude::ButtonStyle::Primary)
            .disabled(page_idx == total_pages - 1);

        vec![poise::serenity_prelude::CreateActionRow::Buttons(vec![
            prev_btn, next_btn,
        ])]
    };

    let mut current_page = 0;

    // Send initial response
    let reply = if total_pages > 1 {
        ctx.send(
            poise::CreateReply::default()
                .embed(make_embed(current_page))
                .components(make_components(current_page))
                .ephemeral(true),
        )
            .await?
    } else {
        // If there's only one page, send without buttons
        ctx.send(
            poise::CreateReply::default()
                .embed(make_embed(current_page))
                .ephemeral(true),
        )
            .await?;
        return Ok(());
    };

    // Listen for button interactions for 2 minutes
    let mut collector =
        poise::serenity_prelude::ComponentInteractionCollector::new(ctx.serenity_context())
            .author_id(ctx.author().id)
            .timeout(std::time::Duration::from_secs(120))
            .stream();

    while let Some(press) = collector.next().await {
        if press.data.custom_id == prev_id && current_page > 0 {
            current_page -= 1;
        } else if press.data.custom_id == next_id && current_page < total_pages - 1 {
            current_page += 1;
        } else {
            continue;
        }

        // Update the embed and button states
        press
            .create_response(
                &ctx.serenity_context().http,
                poise::serenity_prelude::CreateInteractionResponse::UpdateMessage(
                    poise::serenity_prelude::CreateInteractionResponseMessage::new()
                        .embed(make_embed(current_page))
                        .components(make_components(current_page)),
                ),
            )
            .await?;
    }

    // Disable the buttons after timeout to indicate they are no longer active
    let disabled_components = vec![poise::serenity_prelude::CreateActionRow::Buttons(vec![
        poise::serenity_prelude::CreateButton::new(&prev_id)
            .label("◀")
            .style(poise::serenity_prelude::ButtonStyle::Primary)
            .disabled(true),
        poise::serenity_prelude::CreateButton::new(&next_id)
            .label("▶")
            .style(poise::serenity_prelude::ButtonStyle::Primary)
            .disabled(true),
    ])];

    let _ = reply
        .edit(
            ctx,
            poise::CreateReply::default().components(disabled_components),
        )
        .await;

    Ok(())
}

/// Formats and paginates a list of warnings using standard pagination controls.
async fn paginate_warnings(
    ctx: Context<'_>,
    warnings: &[WarningInfo],
    title: String,
    thumbnail_url: Option<String>,
) -> Result<(), Error> {
    let warnings_per_page = 5;
    let chunks: Vec<_> = warnings.chunks(warnings_per_page).collect();
    let total_pages = chunks.len();

    paginate(ctx, total_pages, move |page_idx| {
        let mut embed_description = String::new();

        for warn in chunks[page_idx] {
            let status = if warn.is_active.unwrap_or(true) { "Active" } else { "Pardoned" };
            let time_str = match warn.timestamp {
                Some(ts) => format!("<t:{0}:f> (<t:{0}:R>)", ts),
                None => "*Unknown date*".to_string(),
            };
            let reason = warn.reason.as_deref().unwrap_or("*No reason provided*");

            embed_description.push_str(&format!(
                "**ID: `{}`** | **Mod:** <@{}> ({})\n**User:** <@{}>\n**Date:** {}\n**Reason:** {}\n\n",
                warn.id, warn.moderator_id, status, warn.user_id, time_str, reason
            ));
        }

        let mut embed = poise::serenity_prelude::CreateEmbed::new()
            .title(&title)
            .description(embed_description)
            .color(0x5865F2)
            .footer(poise::serenity_prelude::CreateEmbedFooter::new(format!(
                "Page {} of {}", page_idx + 1, total_pages
            )));

        if let Some(ref url) = thumbnail_url {
            embed = embed.thumbnail(url.clone());
        }

        embed
    }).await?;

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
    let guild_id = ctx.guild_id().unwrap().get() as i64;
    let user_id = member.user.id.get() as i64;
    let db = &ctx.data().db;

    let records = sqlx::query!(
        r#"
        SELECT id, user_id, moderator_id, reason, created_at, is_active
        FROM warns
        WHERE guild_id = ($1)
        AND user_id = ($2)
        AND is_active = TRUE
        ORDER BY created_at DESC;
        "#,
        guild_id,
        user_id,
    )
        .fetch_all(db)
        .await?;

    if records.is_empty() {
        ctx.send(
            poise::CreateReply::default()
                .content(format!("<@{}> has no active warnings.", member.user.id))
                .ephemeral(true),
        )
            .await?;
        return Ok(());
    }

    let warnings: Vec<WarningInfo> = records
        .into_iter()
        .map(|r| WarningInfo {
            id: r.id,
            user_id: r.user_id,
            moderator_id: r.moderator_id,
            reason: r.reason,
            timestamp: r.created_at.map(|dt| dt.timestamp()),
            is_active: r.is_active,
        })
        .collect();

    let title = format!("Warning History for {}", member.user.name);
    let avatar_url = Some(member.user.face());

    paginate_warnings(ctx, &warnings, title, avatar_url).await?;

    Ok(())
}

/// Helper function to handle both pardoning and unpardoning warnings.
async fn set_warning_active_status(
    ctx: Context<'_>,
    id: i32,
    set_active: bool,
) -> Result<(), Error> {
    let guild_id = ctx.guild_id().ok_or("Not in a guild")?.get() as i64;
    let guild_name = ctx.guild().ok_or("Guild cache unavailable")?.name.clone();
    let db = &ctx.data().db;

    // We look for a warning that is currently in the opposite state of our target state
    let expected_current_state = !set_active;

    let res = sqlx::query!(
        r#"
        UPDATE warns
        SET is_active = $1
        WHERE id = $2 AND guild_id = $3 AND is_active = $4
        RETURNING user_id, reason
        "#,
        set_active,
        id,
        guild_id,
        expected_current_state,
    )
        .fetch_optional(db)
        .await?;

    match res {
        Some(row) => {
            let target_user_id = row.user_id as u64;
            let reason = row
                .reason
                .unwrap_or_else(|| "No reason specified.".to_string());
            let user_id = serenity::UserId::new(target_user_id);
            let user = user_id.to_user(&ctx).await?;

            // Determine UI values based on the action
            let (action_past_tense, action_type, color) = if set_active {
                ("unpardoned", ActionType::Unpardon, 0xFF5757)
            } else {
                ("pardoned", ActionType::Pardon, 0x2AB83C)
            };

            let embed = poise::serenity_prelude::CreateEmbed::new()
                .title(format!(
                    "Your warning at {} has been {}.",
                    guild_name, action_past_tense
                ))
                .field("Warning Reason", &reason, false)
                .color(color)
                .thumbnail(ctx.guild().and_then(|g| g.icon_url()).unwrap_or_default());

            let message = poise::serenity_prelude::CreateMessage::new().embed(embed);
            let _ = user.dm(&ctx.serenity_context().http, message).await;

            ctx.send(
                poise::CreateReply::default()
                    .content(format!(
                        "Successfully {} warning **#{}** for <@{}>.",
                        action_past_tense, id, target_user_id
                    ))
                    .ephemeral(true),
            )
                .await?;

            // Log the moderation_old action
            log_moderation_action(
                &ctx,
                guild_id as u64,
                target_user_id,
                ctx.author().id.get(),
                action_type,
                Some(&reason),
                None,
            )
                .await?;
        }
        None => {
            let status_description = if set_active { "inactive" } else { "active" };
            ctx.send(
                poise::CreateReply::default()
                    .content(format!(
                        "Could not find an {} warning with ID **#{}** in this server.",
                        status_description, id
                    ))
                    .ephemeral(true),
            )
                .await?;
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
    #[description = "The warning ID"] id: i32,
) -> Result<(), Error> {
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
    #[description = "The warning ID"] id: i32,
) -> Result<(), Error> {
    set_warning_active_status(ctx, id, true).await
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
    let guild_id = ctx.guild_id().ok_or("Not in a guild")?.get() as i64;
    let db = &ctx.data().db;

    let search_pattern = format!("%{}%", query);
    let target_user_id = user.as_ref().map(|u| u.id.get() as i64);

    let matches = sqlx::query!(
        r#"
        SELECT id, user_id, moderator_id, reason, created_at, is_active
        FROM warns
        WHERE guild_id = $1
          AND reason ILIKE $2
          AND ($3::BIGINT IS NULL OR user_id = $3)
        ORDER BY id DESC
        LIMIT 50
        "#,
        guild_id,
        search_pattern,
        target_user_id,
    )
        .fetch_all(db)
        .await?;

    if matches.is_empty() {
        let filter_message = match user {
            Some(u) => format!("issued to <@{}> ", u.id),
            None => String::new(),
        };
        ctx.send(
            poise::CreateReply::default()
                .content(format!(
                    "No warnings {}found matching `{}`.",
                    filter_message, query
                ))
                .ephemeral(true),
        )
            .await?;
        return Ok(());
    }

    let warnings: Vec<WarningInfo> = matches
        .into_iter()
        .map(|r| WarningInfo {
            id: r.id,
            user_id: r.user_id,
            moderator_id: r.moderator_id,
            reason: r.reason,
            timestamp: r.created_at.map(|dt| dt.timestamp()),
            is_active: r.is_active,
        })
        .collect();

    let title = format!("Search Results for \"{}\"", query);
    let avatar_url = user.as_ref().map(|u| u.face());

    paginate_warnings(ctx, &warnings, title, avatar_url).await?;

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

    #[description = "The ID of the warning to look up"] id: i32,
) -> Result<(), Error> {
    let guild_id = ctx.guild_id().ok_or("Not in a guild")?.get() as i64;
    let db = &ctx.data().db;

    let record = sqlx::query!(
        r#"
        SELECT id, user_id, moderator_id, reason, created_at, is_active
        FROM warns
        WHERE id = $1 AND guild_id = $2
        "#,
        id,
        guild_id,
    )
        .fetch_optional(db)
        .await?;

    match record {
        Some(warn) => {
            let status = if warn.is_active.unwrap_or(true) {
                "Active"
            } else {
                "Pardoned"
            };
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

            ctx.send(poise::CreateReply::default().embed(embed).ephemeral(true))
                .await?;
        }
        None => {
            ctx.send(
                poise::CreateReply::default()
                    .content(format!(
                        "Could not find warning with ID **#{}** in this server.",
                        id
                    ))
                    .ephemeral(true),
            )
                .await?;
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

    #[description = "The warning ID"] id: i32,
) -> Result<(), Error> {
    let guild_id = ctx.guild_id().unwrap().get() as i64;
    let guild_name = ctx.guild().unwrap().name.clone();
    let db = &ctx.data().db;

    let res = sqlx::query!(
        r#"
        DELETE FROM warns
        WHERE id = $1 AND guild_id = $2
        RETURNING user_id, reason
        "#,
        id,
        guild_id
    )
        .fetch_optional(db)
        .await?;

    match res {
        Some(row) => {
            let target_user_id = row.user_id as u64;
            let user_id = serenity::UserId::new(target_user_id);
            let user = user_id.to_user(&ctx).await?;
            let reason = row
                .reason
                .unwrap_or_else(|| "No reason specified.".to_string());

            ctx.send(poise::CreateReply::default()
                .content(format!(
                    "**Warning #{}** for <@{}> has been permanently deleted.\n**Original Reason:** {}",
                    id, target_user_id, reason
                ))
                .ephemeral(true)
            ).await?;

            let embed = poise::serenity_prelude::CreateEmbed::new()
                .title(format!(
                    "Your warning at {} has been permanently deleted!.",
                    guild_name
                ))
                .field("Warning Reason", &reason, false)
                .color(0x48F767)
                .thumbnail(ctx.guild().and_then(|g| g.icon_url()).unwrap_or_default());

            let message = poise::serenity_prelude::CreateMessage::new().embed(embed);
            let _ = user.dm(&ctx.serenity_context().http, message).await;

            // Log the moderation_old action
            log_moderation_action(
                &ctx,
                guild_id as u64,
                target_user_id,
                ctx.author().id.get(),
                ActionType::DeleteWarning,
                Some(&reason),
                None,
            )
                .await?;
        }
        None => {
            ctx.send(
                poise::CreateReply::default()
                    .content(format!(
                        "Could not find a warning with ID **#{}** in this server.",
                        id
                    ))
                    .ephemeral(true),
            )
                .await?;
        }
    }

    Ok(())
}
