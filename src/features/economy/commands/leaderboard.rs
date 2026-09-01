use crate::constants::BRAND_COLOR;
use crate::core::config::state::{Context, Error};
use crate::features::economy::commands;
use crate::features::economy::database::balances::get_leaderboard;
use crate::shared::messages::send_ephemeral;
use crate::shared::pagination;
use serenity::all::{CreateEmbed, CreateEmbedFooter};
use std::fmt::Write;

/// Show the richest users (wallet + bank)
#[poise::command(slash_command, guild_only)]
pub async fn leaderboard(ctx: Context<'_>) -> Result<(), Error> {
    let Some(config) = commands::get_config(&ctx).await? else {
        send_ephemeral(&ctx, "Economy isn't enabled in this server.").await?;
        return Ok(());
    };

    ctx.defer().await?;

    let guild_id = ctx.guild_id().unwrap();
    let db = &ctx.data().core.db;

    let top = get_leaderboard(db, guild_id, 100, 0).await?;
    if top.is_empty() {
        send_ephemeral(
            &ctx,
            "No balances yet. Be the first to `/economy cash work`!",
        )
        .await?;
        return Ok(());
    }

    let per_page = 10;
    let total_len = top.len();
    let chunks: Vec<Vec<_>> = top.chunks(per_page).map(ToOwned::to_owned).collect();
    let total_pages = chunks.len();
    let currency = config.currency_name.clone();

    pagination::paginate(ctx, total_pages, move |page_idx| {
        let chunk = &chunks[page_idx];
        let start_rank = page_idx * per_page;
        let mut description = String::new();
        for (i, bal) in chunk.iter().enumerate() {
            let rank = start_rank + i + 1;
            let medal = match rank {
                1 => "🥇",
                2 => "🥈",
                3 => "🥉",
                _ => "•",
            };
            let total = bal.total();
            let _ = writeln!(
                description, "{medal} **#{rank}** <@{user}>: **{total} {currency}** (wallet {cash}, bank {bank})",
                user = bal.user_id.get(),
                cash = bal.cash,
                bank = bal.bank,
            );
        }

        CreateEmbed::new()
            .title(format!("{currency} Leaderboard"))
            .description(description)
            .color(BRAND_COLOR)
            .footer(CreateEmbedFooter::new(format!(
                "Page {} of {} - Top {}",
                page_idx + 1,
                total_pages,
                total_len
            )))
    })
        .await?;

    Ok(())
}
