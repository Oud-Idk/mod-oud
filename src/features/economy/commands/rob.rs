use crate::constants::BRAND_COLOR;
use crate::core::config::state::{Context, Error};
use crate::features::economy::database::balances::transfer_cash;
use crate::features::economy::{
    EconomyConfig, cache, commands, deduct_cash, ensure_balance, get_balance, keys,
};
use crate::shared::messages::send_ephemeral;
use serenity::all::{CreateEmbed, User};

/// Minimum victim cash above which rob is considered. Also clamped by config.
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
pub async fn rob(ctx: Context<'_>, #[description = "User to rob"] user: User) -> Result<(), Error> {
    if user.id == ctx.author().id || user.bot {
        let msg = if user.bot {
            "You cannot rob a bot."
        } else {
            "You cannot rob yourself."
        };
        return send_ephemeral(&ctx, msg).await;
    }

    let Some(cfg) = commands::get_config(&ctx).await? else {
        return send_ephemeral(&ctx, "Economy isn't enabled in this server.").await;
    };

    ctx.defer().await?;

    match run_heist(&ctx, &user, &cfg).await? {
        HeistOutcome::Notice(msg) => send_ephemeral(&ctx, msg).await,
        HeistOutcome::Embed(embed) => {
            ctx.send(poise::CreateReply::default().embed(*embed))
                .await?;
            Ok(())
        }
    }
}

enum HeistOutcome {
    Notice(String),
    Embed(Box<CreateEmbed>),
}

async fn run_heist(
    ctx: &Context<'_>,
    target: &User,
    cfg: &EconomyConfig,
) -> Result<HeistOutcome, Error> {
    let (db, redis) = (&ctx.data().core.db, &ctx.data().core.redis);
    let (gid, robber_id, victim_id) = (ctx.guild_id().unwrap(), ctx.author().id, target.id);
    let (min, curr, name) = (cfg.rob.min_cash, &cfg.currency_name, target.display_name());

    let robber = ensure_balance(db, gid, robber_id, cfg.starting_balance).await?;
    let victim = get_balance(db, gid, victim_id).await?;

    if robber.cash < min {
        return Ok(HeistOutcome::Notice(format!(
            "You need at least **{min} {curr}** to risk a heist."
        )));
    }
    if victim.cash < min {
        return Ok(HeistOutcome::Notice(format!(
            "**{name}** is too poor (needs **{min} {curr}**)."
        )));
    }

    let key = keys::rob_cooldown_key(gid, robber_id);
    if let Some(wait) = cache::check_cooldown(redis, &key, cfg.rob.cooldown_secs).await? {
        return Ok(HeistOutcome::Notice(format!(
            "You're on cooldown. Try again in {wait}."
        )));
    }

    let is_win = is_success(cfg.rob.success_rate, rand::random());
    let (title, desc, bal, victim_bal) = if is_win {
        let amt = random_steal_amount(victim.cash, cfg.rob.min_percent, cfg.rob.max_percent);
        let Some((v, r)) = transfer_cash(db, gid, victim_id, robber_id, amt).await? else {
            return Ok(HeistOutcome::Notice(format!(
                "**{name}** no longer has enough cash."
            )));
        };
        (
            "Heist Successful!",
            format!("You stole **{amt} {curr}** from **{name}**!"),
            r,
            Some(v.cash),
        )
    } else {
        let fine = fine_amount(robber.cash, cfg.rob.fine_percent);
        let Some(r) = deduct_cash(db, gid, robber_id, fine).await? else {
            return Ok(HeistOutcome::Notice(
                "You were caught, but escaped without paying!".into(),
            ));
        };
        (
            "Heist Failed!",
            format!("Caught robbing **{name}**! Fine: **{fine} {curr}**."),
            r,
            None,
        )
    };

    let mut embed = CreateEmbed::new()
        .title(title)
        .description(desc)
        .field("Your Wallet", format!("{} {curr}", bal.cash), true)
        .field("Your Bank", format!("{} {curr}", bal.bank), true)
        .color(BRAND_COLOR);

    if let Some(v_cash) = victim_bal {
        embed = embed.field(format!("{name}'s Wallet"), format!("{v_cash} {curr}"), true);
    }

    Ok(HeistOutcome::Embed(Box::new(embed)))
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
