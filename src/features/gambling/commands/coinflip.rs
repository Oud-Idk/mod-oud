use crate::constants::BRAND_COLOR;
use crate::core::config::state::{Context, Error};
use crate::features::economy;
use crate::features::gambling::database::get_gambling_config;
use crate::features::gambling::{release_gambling_cooldown, try_acquire_gambling_cooldown};
use crate::shared::messages::send_ephemeral;
use rand::rng;
use rand::seq::IndexedRandom;
use serenity::all::CreateEmbed;

/// The side of the coin to bet on.
#[derive(Debug, Clone, Copy, PartialEq, Eq, poise::ChoiceParameter)]
pub enum CoinSide {
    #[name = "Heads 🪙"]
    Heads,
    #[name = "Tails 🪙"]
    Tails,
}

impl CoinSide {
    #[must_use]
    pub const fn label(self) -> &'static str {
        match self {
            Self::Heads => "Heads",
            Self::Tails => "Tails",
        }
    }

    #[must_use]
    pub const fn emoji(self) -> &'static str {
        match self {
            Self::Heads => "🪙",
            Self::Tails => "🦅", // or 🪙 / tailored emoji
        }
    }

    #[must_use]
    pub fn flip() -> Self {
        let mut rng = rng();
        *[Self::Heads, Self::Tails]
            .choose(&mut rng)
            .unwrap_or(&Self::Heads)
    }
}

/// Flip a coin for a 50/50 double-or-nothing bet!
#[poise::command(slash_command, guild_only)]
pub async fn coinflip(
    ctx: Context<'_>,
    #[description = "The amount of coins to wager"] bet: i64,
    #[description = "Choose Heads or Tails"] choice: CoinSide,
) -> Result<(), Error> {
    let Some(cfg) = get_gambling_config(&ctx).await? else {
        send_ephemeral(&ctx, "Gambling is disabled in this server.").await?;
        return Ok(());
    };
    if !cfg.is_game_enabled(cfg.coinflip.enabled) {
        send_ephemeral(&ctx, "Coinflip is disabled in this server.").await?;
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

    // Deduct bet up front
    let Some(mut balance) = economy::deduct_cash(db, guild_id, user_id, bet).await? else {
        release_gambling_cooldown(&ctx).await;
        send_ephemeral(
            &ctx,
            "You don't have enough cash in your wallet for this bet.",
        )
        .await?;
        return Ok(());
    };

    let outcome = CoinSide::flip();
    let won = choice == outcome;

    let (title, description) = if won {
        let payout = bet * 2; // 2x return (wager + winnings)
        balance = economy::add_cash(db, guild_id, user_id, payout).await?;
        (
            format!("🎉 {} You Won!", outcome.emoji()),
            format!(
                "The coin landed on **{}**!\n\nYou won **+{} coins**!\n**New Wallet Balance:** {}",
                outcome.label(),
                bet,
                balance.cash
            ),
        )
    } else {
        (
            format!("💀 {} You Lost!", outcome.emoji()),
            format!(
                "The coin landed on **{}** (you picked **{}**).\n\nYou lost **-{} coins**.\n**New Wallet Balance:** {}",
                outcome.label(),
                choice.label(),
                bet,
                balance.cash
            ),
        )
    };

    let embed = CreateEmbed::new()
        .title(title)
        .description(description)
        .color(BRAND_COLOR)
        .field("Your Pick", choice.label(), true)
        .field("Landed On", outcome.label(), true);

    ctx.send(poise::CreateReply::default().embed(embed)).await?;

    Ok(())
}
