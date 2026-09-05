use crate::constants::BRAND_COLOR;
use crate::core::config::state::{Context, Error};
use crate::features::economy;
use crate::features::gambling::database::get_gambling_config;
use crate::features::gambling::games::slots::{WinTier, evaluate, format_reels, payout_for, spin};
use crate::features::gambling::{release_gambling_cooldown, try_acquire_gambling_cooldown};
use crate::shared::messages::send_ephemeral;
use serenity::all::CreateEmbed;

/// Spin the slot machine — match 3 to win big!
#[poise::command(slash_command, guild_only)]
pub async fn slots(
    ctx: Context<'_>,
    #[description = "The amount to bet"] bet: i64,
) -> Result<(), Error> {
    let Some(cfg) = get_gambling_config(&ctx).await? else {
        send_ephemeral(&ctx, "Gambling is disabled in this server.").await?;
        return Ok(());
    };
    if !cfg.is_game_enabled(cfg.slots.enabled) {
        send_ephemeral(&ctx, "Slots is disabled in this server.").await?;
        return Ok(());
    }
    if bet <= 0 {
        send_ephemeral(&ctx, "Bet amount must be greater than 0.").await?;
        return Ok(());
    }
    if let Some(msg) = cfg.validate_bet(bet) {
        send_ephemeral(&ctx, msg).await?;
        return Ok(());
    }
    if let Some(wait) = try_acquire_gambling_cooldown(&ctx, &cfg).await {
        send_ephemeral(&ctx, wait).await?;
        return Ok(());
    }

    ctx.defer().await?;

    let guild_id = ctx.guild_id().unwrap();
    let user_id = ctx.author().id;
    let db = &ctx.data().core.db;

    let Some(mut balance) = economy::deduct_cash(db, guild_id, user_id, bet).await? else {
        release_gambling_cooldown(&ctx).await;
        send_ephemeral(
            &ctx,
            "You don't have enough cash in your wallet for this bet.",
        )
        .await?;
        return Ok(());
    };

    let reels = spin();
    let tier = evaluate(reels);
    let payout = payout_for(reels, bet).unwrap_or(0);

    let reels_display = format_reels(reels);

    let (title, description) = if payout > 0 {
        let profit = payout - bet;
        balance = economy::add_cash(db, guild_id, user_id, payout).await?;
        let tier_label = tier.display();
        (
            format!("🎰 {} Jackpot!", reels[0].emoji()),
            format!(
                "**[ {} ]**\n\n{tier_label}\nPayout **{payout}** (profit **+{profit}**)\n**New Wallet Balance:** {}",
                reels_display, balance.cash
            ),
        )
    } else {
        (
            "Try Again!".to_string(),
            format!(
                "**[ {} ]**\n\nYou lost **-{bet} coins**.\n**New Wallet Balance:** {}",
                reels_display, balance.cash
            ),
        )
    };

    let multiplier_label = match tier {
        WinTier::Loss => "0x".to_string(),
        other => format!("{}x", other.multiplier()),
    };

    let embed = CreateEmbed::new()
        .title(title)
        .description(description)
        .color(BRAND_COLOR)
        .field("Reels", format!("[ {reels_display} ]"), true)
        .field("Result", tier.display(), true)
        .field("Multiplier", multiplier_label, true)
        .field(
            "Paytable",
            "🍒🍒🍒 5x | 🍋🍋🍋 8x | 🍊🍊🍊 15x | 🔔🔔🔔 25x | 7️⃣7️⃣7️⃣ 50x\nAny leading pair 2x",
            false,
        );

    ctx.send(poise::CreateReply::default().embed(embed)).await?;

    Ok(())
}
