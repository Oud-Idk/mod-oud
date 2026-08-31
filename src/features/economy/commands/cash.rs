use crate::constants::BRAND_COLOR;
use crate::core::config::state::{Context, Error};
use crate::features::economy::{commands, database, keys};
use crate::shared::messages::send_ephemeral;
use fred::interfaces::KeysInterface;
use fred::prelude::{Expiration, SetOptions};
use humantime::format_duration;
use serenity::all::{CreateEmbed, User};
use std::time::Duration;

#[poise::command(
    slash_command,
    guild_only,
    subcommands("balance", "work", "deposit", "withdraw", "transfer")
)]
pub async fn cash(_: Context<'_>) -> Result<(), Error> {
    Ok(())
}

/// Check your wallet and bank balance
#[poise::command(slash_command, guild_only)]
pub async fn balance(
    ctx: Context<'_>,
    #[description = "The user whose balance you want to view"] user: Option<User>,
) -> Result<(), Error> {
    let Some(config) = commands::get_config(&ctx).await? else {
        send_ephemeral(&ctx, "Economy isn't enabled in this server.").await?;
        return Ok(());
    };

    let guild_id = ctx.guild_id().unwrap();
    let target = user.as_ref().unwrap_or_else(|| ctx.author());
    let db = &ctx.data().core.db;

    let balance = if target.id == ctx.author().id {
        database::ensure_balance(db, guild_id, target.id, config.starting_balance).await?
    } else {
        database::get_balance(db, guild_id, target.id).await?
    };

    let embed = CreateEmbed::new()
        .title(format!("{}'s Balance", target.display_name()))
        .field(
            "Wallet",
            format!("{} {}", balance.cash, config.currency_name),
            true,
        )
        .field(
            "Bank",
            format!("{} {}", balance.bank, config.currency_name),
            true,
        )
        .field(
            "Total",
            format!("{} {}", balance.total(), config.currency_name),
            false,
        )
        .color(BRAND_COLOR);

    ctx.send(poise::CreateReply::default().embed(embed)).await?;

    Ok(())
}

/// Earn some coins
#[poise::command(slash_command, guild_only)]
pub async fn work(ctx: Context<'_>) -> Result<(), Error> {
    let Some(config) = commands::get_config(&ctx).await? else {
        send_ephemeral(&ctx, "Economy isn't enabled in this server.").await?;
        return Ok(());
    };

    let guild_id = ctx.guild_id().unwrap();
    let user_id = ctx.author().id;
    let redis = &ctx.data().core.redis;
    let db = &ctx.data().core.db;

    let cooldown_key = keys::work_cooldown_key(guild_id, user_id);

    let acquired: Option<String> = redis
        .set(
            &cooldown_key,
            "1",
            Some(Expiration::EX(config.work_cooldown_secs)),
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
            format!("You need to wait {wait_time} before working again."),
        )
            .await?;
        return Ok(());
    }

    // Seed starting balance before rewarding, so new users get starting + reward
    database::ensure_balance(db, guild_id, user_id, config.starting_balance).await?;

    let reward = rand::random_range(config.work_min_reward..=config.work_max_reward);

    let balance = database::add_cash(db, guild_id, user_id, reward).await?;

    let currency = &config.currency_name;
    let user_mention = format!("<@{}>", user_id.get());
    // Prefer relational work messages (random), fallback to guild config template
    let description = match database::get_random_work_message(db, guild_id).await {
        Ok(Some(wm)) => wm.render(reward, currency, &user_mention),
        Ok(None) => config.render_work_message_with_user(reward, currency, &user_mention),
        Err(e) => {
            tracing::warn!(%guild_id, error = %e, "Failed to fetch random work message, falling back to config template");
            config.render_work_message_with_user(reward, currency, &user_mention)
        }
    };

    let embed = CreateEmbed::new()
        .title("Work Complete!")
        .description(description)
        .field("Wallet", format!("{}", balance.cash), true)
        .field("Bank", format!("{}", balance.bank), true)
        .field("Total", format!("{}", balance.total()), true)
        .color(BRAND_COLOR);

    ctx.send(poise::CreateReply::default().embed(embed)).await?;

    Ok(())
}

/// Move coins from your wallet to your bank
#[poise::command(slash_command, guild_only)]
pub async fn deposit(
    ctx: Context<'_>,
    #[description = "Amount to deposit (leave empty for all)"] amount: Option<i64>,
) -> Result<(), Error> {
    let Some(config) = commands::get_config(&ctx).await? else {
        send_ephemeral(&ctx, "Economy isn't enabled in this server.").await?;
        return Ok(());
    };

    let guild_id = ctx.guild_id().unwrap();
    let user_id = ctx.author().id;
    let db = &ctx.data().core.db;

    let current = database::ensure_balance(db, guild_id, user_id, config.starting_balance).await?;
    let deposit_amount = amount.unwrap_or(current.cash);

    if deposit_amount <= 0 {
        send_ephemeral(&ctx, "You don't have any coins to deposit.").await?;
        return Ok(());
    }

    let Some(balance) =
        database::transfer_cash_to_bank(db, guild_id, user_id, deposit_amount).await?
    else {
        send_ephemeral(&ctx, "Insufficient wallet balance.").await?;
        return Ok(());
    };

    let currency = &config.currency_name;
    let embed = CreateEmbed::new()
        .title("Deposit Complete!")
        .description(format!(
            "Deposited **{deposit_amount} {currency}** into your bank."
        ))
        .field("Wallet", format!("{} {currency}", balance.cash), true)
        .field("Bank", format!("{} {currency}", balance.bank), true)
        .field("Total", format!("{} {currency}", balance.total()), false)
        .color(BRAND_COLOR);

    ctx.send(poise::CreateReply::default().embed(embed).ephemeral(true))
        .await?;

    Ok(())
}

/// Move coins from your bank to your wallet
#[poise::command(slash_command, guild_only)]
pub async fn withdraw(
    ctx: Context<'_>,
    #[description = "Amount to withdraw (leave empty for all)"] amount: Option<i64>,
) -> Result<(), Error> {
    let Some(config) = commands::get_config(&ctx).await? else {
        send_ephemeral(&ctx, "Economy isn't enabled in this server.").await?;
        return Ok(());
    };

    let guild_id = ctx.guild_id().unwrap();
    let user_id = ctx.author().id;
    let db = &ctx.data().core.db;

    let current = database::ensure_balance(db, guild_id, user_id, config.starting_balance).await?;
    let withdraw_amount = amount.unwrap_or(current.bank);

    if withdraw_amount <= 0 {
        send_ephemeral(&ctx, "You don't have any coins in your bank to withdraw.").await?;
        return Ok(());
    }

    let Some(balance) =
        database::transfer_bank_to_cash(db, guild_id, user_id, withdraw_amount).await?
    else {
        send_ephemeral(&ctx, "Insufficient bank balance.").await?;
        return Ok(());
    };

    let currency = &config.currency_name;
    let embed = CreateEmbed::new()
        .title("Withdrawal Complete!")
        .description(format!(
            "Withdrew **{withdraw_amount} {currency}** from your bank."
        ))
        .field("Wallet", format!("{} {currency}", balance.cash), true)
        .field("Bank", format!("{} {currency}", balance.bank), true)
        .field("Total", format!("{} {currency}", balance.total()), false)
        .color(BRAND_COLOR);

    ctx.send(poise::CreateReply::default().embed(embed).ephemeral(true))
        .await?;

    Ok(())
}

/// Transfer coins from your wallet to another user
#[poise::command(slash_command, guild_only)]
pub async fn transfer(
    ctx: Context<'_>,
    #[description = "User to transfer to"] user: User,
    #[description = "Amount to transfer"] amount: i64,
) -> Result<(), Error> {
    let Some(config) = commands::get_config(&ctx).await? else {
        send_ephemeral(&ctx, "Economy isn't enabled in this server.").await?;
        return Ok(());
    };

    if amount <= 0 {
        send_ephemeral(&ctx, "Amount must be positive.").await?;
        return Ok(());
    }

    let from_user = ctx.author().id;
    let to_user = user.id;

    if from_user == to_user {
        send_ephemeral(&ctx, "You cannot transfer coins to yourself.").await?;
        return Ok(());
    }

    if user.bot {
        send_ephemeral(&ctx, "You cannot transfer coins to a bot.").await?;
        return Ok(());
    }

    ctx.defer().await?;

    let guild_id = ctx.guild_id().unwrap();
    let db = &ctx.data().core.db;

    // Seed both participants with starting balance if they have no row yet
    database::ensure_balance(db, guild_id, from_user, config.starting_balance).await?;
    database::ensure_balance(db, guild_id, to_user, config.starting_balance).await?;

    let result = database::transfer_cash(db, guild_id, from_user, to_user, amount).await?;

    let Some((sender_balance, _receiver_balance)) = result else {
        let current = database::get_balance(db, guild_id, from_user).await?;
        send_ephemeral(
            &ctx,
            format!(
                "Insufficient wallet balance. You have **{} {}** in your wallet, but tried to transfer **{} {}**.",
                current.cash, config.currency_name, amount, config.currency_name
            ),
        )
            .await?;
        return Ok(());
    };

    let currency = &config.currency_name;
    let embed = CreateEmbed::new()
        .title("Transfer Complete!")
        .description(format!(
            "You transferred **{amount} {currency}** to **{}**.",
            user.display_name()
        ))
        .field(
            "Your Wallet",
            format!("{} {currency}", sender_balance.cash),
            true,
        )
        .field(
            "Your Bank",
            format!("{} {currency}", sender_balance.bank),
            true,
        )
        .color(BRAND_COLOR);

    ctx.send(poise::CreateReply::default().embed(embed)).await?;

    Ok(())
}
