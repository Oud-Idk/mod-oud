use crate::core::config::state::{Context, Error};
use crate::features::invite_tracking;
use anyhow::{Context as _, Result};
use fred::interfaces::HashesInterface;
use serenity::all::Member;

/// Check who invited a particular member
#[poise::command(slash_command)]
pub async fn inviter(
    ctx: Context<'_>,
    #[description = "The member to check"] member: Member,
) -> Result<()> {
    let guild_id = ctx.guild_id().with_context(|| "This command can only be used in a server")?;
    let db = &ctx.data().core.db;

    // Fetch the inviter details from Postgres
    let record = sqlx::query!(
        r#"
        SELECT inviter_id, invite_code, created_at
        FROM invited_members
        WHERE guild_id = $1 AND member_id = $2
        "#,
        guild_id.get() as i64,
        member.user.id.get() as i64,
    )
        .fetch_optional(db)
        .await?;

    match record {
        Some(row) => {
            let timestamp = row.created_at.timestamp();
            ctx.say(format!(
                "**{}** was invited by <@{}> using code `{}` (<t:{}:R>).",
                member.user.name,
                row.inviter_id,
                row.invite_code,
                timestamp
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

/// Display your invite link and your invite stats
#[poise::command(slash_command)]
pub async fn invites(
    ctx: Context<'_>,
    #[description = "Optional member to check stats for"] member: Option<Member>,
) -> Result<(), Error> {
    let guild_id = ctx.guild_id().with_context(|| "This command can only be used in a server")?;
    let db = &ctx.data().core.db;
    let redis = &ctx.data().core.redis;

    // Default to the person running the command if they didn't specify a target
    let target_user = member.map(|m| m.user).unwrap_or_else(|| ctx.author().clone());
    let target_id = target_user.id;

    // 1. Fetch total invite count from Postgres
    let count_row = sqlx::query_scalar!(
        "SELECT count FROM inviter_counts WHERE guild_id = $1 AND inviter_id = $2",
        guild_id.get() as i64,
        target_id.get() as i64,
    )
        .fetch_optional(db)
        .await?;

    let invite_count = count_row.unwrap_or(0);

    // 2. Look up their active invite code from the Redis map we populated in fetch_current_invites
    let active_code: Option<String> = redis
        .hget(&invite_tracking::keys::codes_by_inviter_key(guild_id), target_id.get().to_string())
        .await
        .unwrap_or(None);

    let invite_link_msg = match active_code {
        Some(code) => format!("Active invite link: https://discord.gg/{}", code),
        None => "No active personal invite link found in cache. Create an invite link in Discord to get one!".to_string(),
    };

    ctx.say(format!(
        "📊 **Invite Stats for <@{}>**\n• Total Invites: **{}**\n• {}",
        target_id, invite_count, invite_link_msg
    ))
        .await?;

    Ok(())
}

/// Display the invites leaderboard
#[poise::command(slash_command, rename = "invites-leaderboard")]
pub async fn invites_leaderboard(ctx: Context<'_>) -> Result<(), Error> {
    let guild_id = ctx.guild_id().with_context(|| "This command can only be used in a server")?;
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
        guild_id.get() as i64,
    )
        .fetch_all(db)
        .await?;

    if top_inviters.is_empty() {
        ctx.say("The leaderboard is currently empty! Start inviting people to claim the top spot. 🏆").await?;
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