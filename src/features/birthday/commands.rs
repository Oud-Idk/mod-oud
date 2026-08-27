#![allow(missing_docs, clippy::unused_async)]
use std::slice;

use crate::core::config::guild_ctx::get_guild_ctx;
use crate::core::config::state::{Context, Error};
use crate::features::birthday::placeholders::replace_birthday_placeholders;
use crate::features::birthday::types::{BirthdayMember, Month};
use crate::features::birthday::{database, pagination};
use crate::shared::embed::build_custom_message;
use crate::shared::messages::send_ephemeral;
use anyhow::{Context as _, anyhow};
use chrono::{Datelike, Utc};
use poise::serenity_prelude as serenity;

/// Birthday management commands
#[poise::command(
    slash_command,
    guild_only,
    subcommands(
        "set",
        "remove",
        "view",
        "upcoming",
        "test",
        "force_set",
        "force_remove"
    )
)]
pub async fn birthday(_: Context<'_>) -> Result<(), Error> {
    Ok(())
}

/// Register or update your birthday
#[poise::command(slash_command)]
async fn set(
    ctx: Context<'_>,
    #[description = "Month of birth"] month: Month,
    #[description = "Day of birth (1-31)"] day: i16,
    #[description = "Birth year (optional)"] year: Option<i32>,
) -> Result<(), Error> {
    ctx.defer_ephemeral().await?;
    let month_num = month as i16;

    if let Err(e) = validate_birthday_input(month, day, year) {
        ctx.send(poise::CreateReply::default().content(e).ephemeral(true))
            .await?;
        return Ok(());
    }

    let uid = ctx.author().id.get();
    database::set_birthday(&ctx.data().core.db, uid, month_num, day, year).await?;

    let year_str = year.map(|y| format!(", {y}")).unwrap_or_default();
    ctx.send(
        poise::CreateReply::default()
            .content(format!(
                "Saved your birthday as **{month:?} {day}{year_str}**!"
            ))
            .ephemeral(true),
    )
    .await?;

    Ok(())
}

/// Test the birthday announcement message using dashboard settings (Mods only)
#[poise::command(slash_command, default_member_permissions = "MANAGE_GUILD", guild_only)]
async fn test(ctx: Context<'_>) -> Result<(), Error> {
    ctx.defer_ephemeral().await?;
    let guild_id = ctx.guild_id().with_context(|| "Must be run in a guild")?;

    let settings = crate::core::config::settings::get_settings(
        &ctx.data().core.db,
        &ctx.data().core.redis,
        &ctx.data().core.guild_configs_cache,
        guild_id,
    )
    .await?;

    let Some(birthday_cfg) = settings.birthday.filter(|c| c.enabled) else {
        send_ephemeral(&ctx, "Birthday announcements are disabled for this server.").await?;
        return Ok(());
    };

    // Dummy celebrant for testing
    let mock_celebrant = BirthdayMember {
        user_id: ctx.author().id,
        display_name: ctx.author().name.clone(),
        birth_year: Some(2000),
    };

    let gctx = get_guild_ctx(guild_id, &ctx.serenity_context().http).await?;

    let msg = build_custom_message(
        birthday_cfg.message.format,
        &birthday_cfg.message.content,
        &birthday_cfg.message.embed,
        |t| replace_birthday_placeholders(t, &gctx, slice::from_ref(&mock_celebrant)),
    )?
    .ok_or_else(|| anyhow!("Message is not valid or is not set up"))?;

    send_ephemeral(&ctx, format!("**Preview Announcement:**\n\n{msg:?}")).await?;

    Ok(())
}

/// View upcoming birthdays in the server
#[poise::command(slash_command)]
pub async fn upcoming(
    ctx: Context<'_>,
    #[description = "Days ahead to check (default: 14)"] days: Option<i16>,
) -> Result<(), Error> {
    let lookahead_days = i32::from(days.unwrap_or(14).min(60));

    let records = database::get_upcoming_birthdays(&ctx.data().core.db, lookahead_days).await?;

    if records.is_empty() {
        send_ephemeral(
            &ctx,
            format!("No upcoming birthdays in the next **{lookahead_days}** days."),
        )
        .await?;
        return Ok(());
    }

    let title = format!("Upcoming Birthdays (Next {lookahead_days} Days)");

    // Paginate automatically handles 1 page or 100 pages!
    pagination::paginate_birthdays(ctx, &records, title).await?;

    Ok(())
}

/// View your registered birthday
#[poise::command(slash_command)]
async fn view(ctx: Context<'_>) -> Result<(), Error> {
    ctx.defer_ephemeral().await?;
    let uid = ctx.author().id;

    let birthday = database::get_user_birthday(&ctx.data().core.db, uid).await?;

    match birthday {
        Some(b) => {
            let month_name = match b.birth_month {
                1 => "January",
                2 => "February",
                3 => "March",
                4 => "April",
                5 => "May",
                6 => "June",
                7 => "July",
                8 => "August",
                9 => "September",
                10 => "October",
                11 => "November",
                12 => "December",
                _ => "Unknown",
            };
            let year_str = b.birth_year.map(|y| format!(", {y}")).unwrap_or_default();
            send_ephemeral(
                &ctx,
                format!(
                    "Your birthday is set to **{} {}{}**.",
                    month_name, b.birth_day, year_str
                ),
            )
            .await?;
        }
        None => {
            send_ephemeral(
                &ctx,
                "You haven't registered a birthday yet. Use `/birthday set` to add one.",
            )
            .await?;
        }
    }

    Ok(())
}

/// Remove your registered birthday
#[poise::command(slash_command)]
async fn remove(ctx: Context<'_>) -> Result<(), Error> {
    ctx.defer_ephemeral().await?;

    let birthday = database::get_user_birthday(&ctx.data().core.db, ctx.author().id).await?;

    if birthday.is_none() {
        send_ephemeral(&ctx, "You don't have a birthday registered.").await?;
        return Ok(());
    }

    database::remove_birthday(&ctx.data().core.db, ctx.author().id).await?;
    send_ephemeral(&ctx, "Your birthday has been removed.").await?;

    Ok(())
}

/// Force set a birthday for a user (Mods only)
#[poise::command(slash_command, default_member_permissions = "MANAGE_GUILD", guild_only)]
async fn force_set(
    ctx: Context<'_>,
    #[description = "User to set birthday for"] user: serenity::User,
    #[description = "Month of birth"] month: Month,
    #[description = "Day of birth (1-31)"] day: i16,
    #[description = "Birth year (optional)"] year: Option<i32>,
) -> Result<(), Error> {
    ctx.defer_ephemeral().await?;
    let month_num = month as i16;

    if let Err(e) = validate_birthday_input(month, day, year) {
        ctx.send(poise::CreateReply::default().content(e).ephemeral(true))
            .await?;
        return Ok(());
    }

    let uid = user.id.get();
    database::set_birthday(&ctx.data().core.db, uid, month_num, day, year).await?;

    let year_str = year.map(|y| format!(", {y}")).unwrap_or_default();
    ctx.send(
        poise::CreateReply::default()
            .content(format!(
                "Set birthday for **{}** to **{:?} {}{}**!",
                user.name, month, day, year_str
            ))
            .ephemeral(true),
    )
    .await?;

    Ok(())
}

/// Force remove a birthday for a user (Mods only)
#[poise::command(slash_command, default_member_permissions = "MANAGE_GUILD", guild_only)]
async fn force_remove(
    ctx: Context<'_>,
    #[description = "User to remove birthday for"] user: serenity::User,
) -> Result<(), Error> {
    ctx.defer_ephemeral().await?;
    let birthday = database::get_user_birthday(&ctx.data().core.db, ctx.author().id).await?;

    if birthday.is_none() {
        send_ephemeral(
            &ctx,
            format!("**{}** doesn't have a birthday registered.", user.name),
        )
        .await?;
        return Ok(());
    }

    database::remove_birthday(&ctx.data().core.db, ctx.author().id).await?;
    send_ephemeral(&ctx, format!("Removed birthday for **{}**.", user.name)).await?;

    Ok(())
}

fn validate_birthday_input(month: Month, day: i16, year: Option<i32>) -> Result<(), String> {
    let month_num = month as i16;
    let max_days = date_valid_for_month(year, month_num);

    if day < 1 || day > max_days {
        return Err(format!(
            "Invalid day **{day}** for month **{month:?}**. Maximum is **{max_days}**."
        ));
    }

    if let Some(y) = year {
        let current_year = Utc::now().year();
        if y < 1920 || y > current_year {
            return Err(format!(
                "Please enter a valid birth year between 1920 and {current_year}."
            ));
        }
    }

    Ok(())
}

fn date_valid_for_month(year: Option<i32>, month_num: i16) -> i16 {
    match month_num {
        2 => {
            if year.is_none_or(is_leap_year) {
                29
            } else {
                28
            }
        }
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    }
}

const fn is_leap_year(year: i32) -> bool {
    (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
}
