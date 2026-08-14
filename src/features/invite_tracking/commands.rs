#![allow(missing_docs)]
use crate::core::config::state::{Context, Error};
use crate::features::invite_tracking;
use crate::features::invite_tracking::database;
use anyhow::{Context as _, Result};
use fred::interfaces::SetsInterface;
use serenity::all::Member;

/// Check who invited a particular member
#[poise::command(slash_command)]
pub async fn inviter(
    ctx: Context<'_>,
    #[description = "The member to check"] member: Member,
) -> Result<()> {
    let guild_id = ctx
        .guild_id()
        .with_context(|| "This command can only be used in a server")?;
    let db = &ctx.data().core.db;

    // Fetch the inviter details from Postgres
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
    let guild_id = ctx
        .guild_id()
        .with_context(|| "This command can only be used in a server")?;
    let db = &ctx.data().core.db;
    let redis = &ctx.data().core.redis;

    let target_user = member.map_or_else(|| ctx.author().clone(), |m| m.user);
    let target_id = target_user.id;

    // Fetch total invite count from Postgres
    let count_row = sqlx::query_scalar!(
        "SELECT count FROM inviter_counts WHERE guild_id = $1 AND inviter_id = $2",
        guild_id.get().cast_signed(),
        target_id.get() as i64,
    )
    .fetch_optional(db)
    .await?;

    let invite_count = count_row.unwrap_or(0);

    // Fetch all active invite codes for this user from Redis Set
    let active_codes: Vec<String> = redis
        .smembers(invite_tracking::keys::user_invites_key(
            guild_id,
            target_id.get(),
        ))
        .await
        .unwrap_or_default();

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
    let guild_id = ctx
        .guild_id()
        .with_context(|| "This command can only be used in a server")?;
    let db = &ctx.data().core.db;

    // Fetch top 10 inviters with at least 1 invite
    let top_inviters = sqlx::query!(
        r#"
        SELECT inviter_id, count
        FROM inviter_counts
        WHERE guild_id = $1 AND count > 0
        ORDER BY count DESC
        LIMIT 10
        "#,
        guild_id.get().cast_signed(),
    )
    .fetch_all(db)
    .await?;

    if top_inviters.is_empty() {
        ctx.say(
            "The leaderboard is currently empty! Start inviting people to claim the top spot. 🏆",
        )
        .await?;
        return Ok(());
    }

    let mut leaderboard_text = String::from("🏆 **Invites Leaderboard** 🏆\n\n");
    for (index, row) in top_inviters.iter().enumerate() {
        leaderboard_text.push_str(&format!(
            "{}. <@{}> — **{}** invite{}\n",
            index + 1,
            row.inviter_id,
            row.count,
            if row.count == 1 { "" } else { "s" }
        ));
    }

    ctx.say(leaderboard_text).await?;

    Ok(())
}
