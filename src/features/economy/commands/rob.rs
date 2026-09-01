use crate::constants::BRAND_COLOR;
use crate::core::config::state::{Context, Error};
use crate::features::economy::{commands, deduct_cash, ensure_balance, get_balance, keys};
use crate::shared::messages::send_ephemeral;
use fred::interfaces::KeysInterface;
use fred::prelude::{Expiration, SetOptions};
use humantime::format_duration;
use serenity::all::{CreateEmbed, User};
use std::time::Duration;
use crate::features::economy::database::balances::transfer_cash;

/// Minimum victim cash above which rob is considered - also clamped by config.
/// Business logic helpers are pure for testability.

/// Returns the inclusive bounds for a steal amount given victim cash and config percents.
#[must_use]
pub fn steal_bounds(victim_cash: i64, min_percent: i64, max_percent: i64) -> (i64, i64) {
    let (low, high) = if min_percent <= max_percent {
        (min_percent, max_percent)
    } else {
        (max_percent, min_percent)
    };
    let low = low.clamp(0, 100);
    let high = high.clamp(0, 100);
    let min = victim_cash.saturating_mul(low) / 100;
    let max = victim_cash.saturating_mul(high) / 100;
    // Ensure at least 1 coin stolen on success when victim has cash
    let min = min.max(1).min(victim_cash);
    let max = max.max(min).min(victim_cash);
    (min, max)
}

/// Calculate a random steal amount within bounds (inclusive).
pub fn random_steal_amount(victim_cash: i64, min_percent: i64, max_percent: i64) -> i64 {
    let (min, max) = steal_bounds(victim_cash, min_percent, max_percent);
    if min >= max {
        min
    } else {
        rand::random_range(min..=max)
    }
}

/// Calculate fine amount the robber pays on failure.
/// Returns 0 if robber has no cash.
#[must_use]
pub fn fine_amount(robber_cash: i64, fine_percent: i64) -> i64 {
    if robber_cash <= 0 || fine_percent <= 0 {
        return 0;
    }
    let pct = fine_percent.clamp(0, 100);
    let fine = robber_cash.saturating_mul(pct) / 100;
    fine.clamp(1, robber_cash)
}

/// Decide if a rob attempt succeeds given configured rate and a random float in [0,1).
#[must_use]
pub fn is_success(success_rate: f64, roll: f64) -> bool {
    let rate = success_rate.clamp(0.0, 1.0);
    roll < rate
}

/// Attempt to rob another user's wallet.
///
/// Success steals a random percentage of the victim's wallet (cash only),
/// failure makes the robber pay a fine. A per-user cooldown prevents spam.
#[poise::command(slash_command, guild_only)]
pub async fn rob(
    ctx: Context<'_>,
    #[description = "User to rob"] user: User,
) -> Result<(), Error> {
    if user.id == ctx.author().id {
        send_ephemeral(&ctx, "You cannot rob yourself.").await?;
        return Ok(());
    }

    if user.bot {
        send_ephemeral(&ctx, "You cannot rob a bot.").await?;
        return Ok(());
    }

    let Some(config) = commands::get_config(&ctx).await? else {
        send_ephemeral(&ctx, "Economy isn't enabled in this server.").await?;
        return Ok(());
    };

    ctx.defer().await?;

    let guild_id = ctx.guild_id().unwrap();
    let robber_id = ctx.author().id;
    let victim_id = user.id;
    let db = &ctx.data().core.db;
    let redis = &ctx.data().core.redis;

    // Fetch balances (ensure_balance already returns the balance!)
    let robber_balance = ensure_balance(db, guild_id, robber_id, config.starting_balance).await?;
    let victim_balance = get_balance(db, guild_id, victim_id).await?;

    // Prevent zero-risk robbery exploits: Robber must have cash to risk!
    if robber_balance.cash < config.rob.min_cash {
        send_ephemeral(
            &ctx,
            format!(
                "You need at least **{} {}** in your wallet to risk a heist.",
                config.rob.min_cash, config.currency_name
            ),
        )
            .await?;
        return Ok(());
    }

    // Victim cash check
    if victim_balance.cash < config.rob.min_cash {
        send_ephemeral(
            &ctx,
            format!(
                "**{}** is too poor to rob. They need at least **{} {}** in their wallet (they have **{}**).",
                user.display_name(),
                config.rob.min_cash,
                config.currency_name,
                victim_balance.cash
            ),
        )
            .await?;
        return Ok(());
    }

    // Cooldown check
    let cooldown_key = keys::rob_cooldown_key(guild_id, robber_id);
    let cooldown_secs = config.rob.cooldown_secs.max(0);
    if cooldown_secs > 0 {
        let acquired: Option<String> = redis
            .set(
                &cooldown_key,
                "1",
                Some(Expiration::EX(cooldown_secs)),
                Some(SetOptions::NX),
                false,
            )
            .await
            .ok();

        if acquired.is_none() {
            let remaining = redis.ttl::<i64, _>(&cooldown_key).await.unwrap_or(0);
            #[allow(clippy::cast_sign_loss)]
            let wait_secs = remaining.max(0) as u64;
            let wait_time = format_duration(Duration::from_secs(wait_secs));
            send_ephemeral(
                &ctx,
                format!("You're on cooldown. Try again in {wait_time}."),
            )
                .await?;
            return Ok(());
        }
    }

    // Roll for success
    let roll: f64 = rand::random();
    let success = is_success(config.rob.success_rate, roll);
    let currency = config.currency_name.clone();

    if success {
        let amount = random_steal_amount(
            victim_balance.cash,
            config.rob.min_percent,
            config.rob.max_percent,
        );

        let result = transfer_cash(db, guild_id, victim_id, robber_id, amount).await?;

        if let Some((victim_new, robber_new)) = result {
            let embed = CreateEmbed::new()
                .title("Heist Successful! 💰")
                .description(format!(
                    "You stole **{amount} {currency}** from **{}**!",
                    user.display_name()
                ))
                .field("Your Wallet", format!("{} {currency}", robber_new.cash), true)
                .field("Your Bank", format!("{} {currency}", robber_new.bank), true)
                .field(
                    format!("{}'s Wallet", user.display_name()),
                    format!("{} {currency}", victim_new.cash),
                    true,
                )
                .color(BRAND_COLOR);

            ctx.send(poise::CreateReply::default().embed(embed)).await?;
        } else {
            send_ephemeral(
                &ctx,
                format!(
                    "**{}** no longer has enough cash to rob. Try again later.",
                    user.display_name()
                ),
            )
                .await?;
        }
    } else {
        let fine = fine_amount(robber_balance.cash, config.rob.fine_percent);
        let deducted = deduct_cash(db, guild_id, robber_id, fine).await?;

        if let Some(new_balance) = deducted {
            let embed = CreateEmbed::new()
                .title("Heist Failed! 🚨")
                .description(format!(
                    "You were caught trying to rob **{}**! You paid a fine of **{fine} {currency}**.",
                    user.display_name()
                ))
                .field("Your Wallet", format!("{} {currency}", new_balance.cash), true)
                .field("Your Bank", format!("{} {currency}", new_balance.bank), true)
                .color(BRAND_COLOR);

            ctx.send(poise::CreateReply::default().embed(embed)).await?;
        } else {
            send_ephemeral(&ctx, "You were caught, but managed to escape without paying!").await?;
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{fine_amount, is_success, steal_bounds};

    #[test]
    fn steal_bounds_basic() {
        let (min, max) = steal_bounds(1000, 10, 30);
        assert_eq!(min, 100);
        assert_eq!(max, 300);
    }

    #[test]
    fn steal_bounds_clamps_percent() {
        let (min, max) = steal_bounds(1000, 150, -20);
        // clamped to 0..100, swapped
        assert!(min <= max);
        assert!(max <= 1000);
    }

    #[test]
    fn steal_bounds_small_victim() {
        let (min, max) = steal_bounds(1, 10, 30);
        assert_eq!(min, 1);
        assert_eq!(max, 1);
    }

    #[test]
    fn steal_bounds_zero_victim() {
        let (min, max) = steal_bounds(0, 10, 30);
        assert_eq!(min, 0);
        assert_eq!(max, 0);
    }

    #[test]
    fn fine_amount_percent() {
        assert_eq!(fine_amount(1000, 10), 100);
        assert_eq!(fine_amount(1000, 0), 0);
        assert_eq!(fine_amount(0, 10), 0);
        assert_eq!(fine_amount(5, 50), 2);
    }

    #[test]
    fn fine_amount_clamped_to_cash() {
        assert_eq!(fine_amount(10, 200), 10);
        assert_eq!(fine_amount(1, 10), 1);
    }

    #[test]
    fn success_rate_clamped() {
        assert!(is_success(1.5, 0.99));
        assert!(!is_success(-0.5, 0.0));
        assert!(is_success(0.5, 0.3));
        assert!(!is_success(0.5, 0.7));
        assert!(!is_success(0.0, 0.0));
    }
}
