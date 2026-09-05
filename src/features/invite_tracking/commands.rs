#![allow(missing_docs, clippy::unused_async)]
use crate::core::config::state::{Context, Error};
use crate::features::invite_tracking::{cache, database};
use anyhow::{Context as _, Result};
use serenity::all::Member;
use std::fmt::Write;

/// Check who invited a particular member
#[poise::command(slash_command)]
pub async fn inviter(
    ctx: Context<'_>,
    #[description = "The member to check"] member: Member,
) -> Result<()> {
    let guild_id = ctx.guild_id().with_context(|| "Must be run in a guild")?;
    let db = &ctx.data().core.db;

    // Fetch inviter details from Postgres
    let record = database::get_inviter_details(db, guild_id, &member).await?;

    match record {
        Some(row) => {
            let timestamp = row.created_at.timestamp();
            ctx.say(format!(
                "**{}** was invited by <@{}> using code `{}` (<t:{}:R>).",
                member.user.name, row.inviter_id, row.invite_code, timestamp
            ))
            .await?;
        }
        None => {
            ctx.say(format!(
                "I couldn't find who invited **{}**. They may have joined before I started tracking, or via a vanity URL/bot invite.",
                member.user.name
            ))
                .await?;
        }
    }

    Ok(())
}

/// Displays all invites someone has
#[poise::command(slash_command)]
pub async fn invites(
    ctx: Context<'_>,
    #[description = "Optional member to check stats for"] member: Option<Member>,
) -> Result<(), Error> {
    let guild_id = ctx.guild_id().with_context(|| "Must be run in a guild")?;
    let core = &ctx.data().core;

    let target_user = member.map_or_else(|| ctx.author().clone(), |m| m.user);
    let target_id = target_user.id;

    let invite_count = database::get_user_invite_count(&core.db, guild_id, target_id).await?;
    let active_codes = cache::get_user_invite_codes(&core.redis, guild_id, target_id).await;

    // 3 Format message
    let invite_link_msg = match active_codes.len() {
        0 => "No active personal invite link found in cache. Create one in Discord to get one!"
            .to_string(),
        1 => format!("Active invite link: https://discord.gg/{}", active_codes[0]),
        _ => {
            let links = active_codes
                .iter()
                .map(|code| format!("• https://discord.gg/{code}"))
                .collect::<Vec<_>>()
                .join("\n");
            format!("Active invite links:\n{links}")
        }
    };

    ctx.say(format!(
        "**Invite Stats for <@{target_id}>**\n• Total Invites: **{invite_count}**\n{invite_link_msg}"
    ))
        .await?;

    Ok(())
}

/// Display the invites leaderboard
#[poise::command(slash_command, rename = "invites-leaderboard")]
pub async fn invites_leaderboard(ctx: Context<'_>) -> Result<(), Error> {
    let guild_id = ctx.guild_id().with_context(|| "Must be run in a guild")?;
    let db = &ctx.data().core.db;

    let top_inviters = database::get_top_inviters(db, guild_id, 10).await?;

    if top_inviters.is_empty() {
        ctx.say("The leaderboard is currently empty! Start inviting people to claim the top spot.")
            .await?;
        return Ok(());
    }

    let mut leaderboard_text = String::with_capacity(top_inviters.len() * 40 + 32);
    let _ = write!(leaderboard_text, "**Invites Leaderboard**\n\n");

    for (index, entry) in top_inviters.iter().enumerate() {
        let _ = writeln!(
            leaderboard_text,
            "{}. <@{}>: **{}** invite{}",
            index + 1,
            entry.inviter_id,
            entry.count,
            if entry.count == 1 { "" } else { "s" }
        );
    }

    ctx.say(leaderboard_text).await?;

    Ok(())
}
