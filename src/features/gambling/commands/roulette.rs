use crate::constants::BRAND_COLOR;
use crate::core::config::state::{Context, Error};
use crate::features::economy;
use crate::features::gambling::database::get_gambling_config;
use crate::features::gambling::games::roulette::{
    parse_space, payout_for, pocket_color, pocket_emoji, spin,
};
use crate::features::gambling::{release_gambling_cooldown, try_acquire_gambling_cooldown};
use crate::shared::messages::send_ephemeral;
use serenity::all::CreateEmbed;

/// European wheel 0-36.
#[poise::command(slash_command, guild_only)]
pub async fn roulette(
    ctx: Context<'_>,
    #[description = "The amount to bet"] bet: i64,
    #[description = "Space: 0-36, odd/even, red/black, 1st/2nd/3rd or 1-12/13-24/25-36"]
    space: String,
) -> Result<(), Error> {
    let Some(cfg) = get_gambling_config(&ctx).await? else {
        send_ephemeral(&ctx, "Gambling is disabled in this server.").await?;
        return Ok(());
    };
    if !cfg.is_game_enabled(cfg.roulette.enabled) {
        send_ephemeral(&ctx, "Roulette is disabled in this server.").await?;
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

    let Some(bet_kind) = parse_space(&space) else {
        release_gambling_cooldown(&ctx).await;
        send_ephemeral(
            &ctx,
            "Invalid space. Use: `0`-`36`, `odd`/`even`, `red`/`black`, `1st`/`2nd`/`3rd` or `1-12`/`13-24`/`25-36`. Examples: `/roulette 100 odd`, `/roulette 100 3rd`, `/roulette 100 13-24`, `/roulette 100 16`",
        )
            .await?;
        return Ok(());
    };

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

    let winning = spin();
    let payout = payout_for(bet_kind, winning, bet).unwrap_or(0);

    let (title, description) = if payout > 0 {
        let profit = payout - bet;
        balance = economy::add_cash(db, guild_id, user_id, payout).await?;
        (
            format!("🎉 {} You Won!", pocket_emoji(winning)),
            format!(
                "The ball landed on **{} {}** ({})!\n\nYour bet on **{}** won!\nPayout **{}** (profit **+{}**)\n**New Wallet Balance:** {}",
                winning,
                pocket_emoji(winning),
                pocket_color(winning),
                bet_kind.display(),
                payout,
                profit,
                balance.cash
            ),
        )
    } else {
        (
            format!("💀 {} You Lost!", pocket_emoji(winning)),
            format!(
                "The ball landed on **{} {}** ({}) (you bet **{}**).\n\nYou lost **-{} coins**.\n**New Wallet Balance:** {}",
                winning,
                pocket_emoji(winning),
                pocket_color(winning),
                bet_kind.display(),
                bet,
                balance.cash
            ),
        )
    };

    let multiplier = bet_kind.payout_multiplier();
    let embed = CreateEmbed::new()
        .title(title)
        .description(description)
        .color(BRAND_COLOR)
        .field(
            "Your Bet",
            format!("{} on {}", bet, bet_kind.display()),
            true,
        )
        .field(
            "Landed On",
            format!(
                "{} {} ({})",
                winning,
                pocket_emoji(winning),
                pocket_color(winning)
            ),
            true,
        )
        .field("Payout", format!("{multiplier}x"), true);

    ctx.send(poise::CreateReply::default().embed(embed)).await?;

    Ok(())
}
