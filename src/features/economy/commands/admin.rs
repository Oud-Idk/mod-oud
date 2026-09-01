use crate::constants::BRAND_COLOR;
use crate::core::config::state::{Context, Error};
use crate::features::economy::{commands, ensure_balance, get_balance, deduct_cash, add_cash};
use crate::shared::messages::send_ephemeral;
use serenity::all::{CreateEmbed, User};
use crate::features::economy::database::balances::set_cash;
use crate::features::economy::types::Balance;

#[poise::command(slash_command, guild_only, subcommands("give", "take", "set"))]
pub async fn admin(_: Context<'_>) -> Result<(), Error> {
    Ok(())
}

/// Give coins to a user (admin)
#[poise::command(slash_command, guild_only, required_permissions = "MANAGE_GUILD")]
pub async fn give(
    ctx: Context<'_>,
    #[description = "User to give coins to"] user: User,
    #[description = "Amount to give"] amount: i64,
) -> Result<(), Error> {
    if amount <= 0 {
        send_ephemeral(&ctx, "Amount must be positive.").await?;
        return Ok(());
    }
    if user.bot {
        send_ephemeral(&ctx, "You cannot give coins to a bot.").await?;
        return Ok(());
    }

    let Some(config) = commands::get_config(&ctx).await? else {
        send_ephemeral(&ctx, "Economy isn't enabled in this server.").await?;
        return Ok(());
    };

    ctx.defer().await?;
    let guild_id = ctx.guild_id().unwrap();
    let db = &ctx.data().core.db;

    // Seed if brand new, then add cash
    ensure_balance(db, guild_id, user.id, config.starting_balance).await?;
    let balance = add_cash(db, guild_id, user.id, amount).await?;

    let description = format!("Gave **{amount} {}** to **{}**.", config.currency_name, user.display_name());
    send_balance_embed(&ctx, "Coins Given", &description, &balance, &config.currency_name).await?;
    Ok(())
}

/// Take coins from a user (admin)
#[poise::command(slash_command, guild_only, required_permissions = "MANAGE_GUILD")]
pub async fn take(
    ctx: Context<'_>,
    #[description = "User to take coins from"] user: User,
    #[description = "Amount to take"] amount: i64,
) -> Result<(), Error> {
    if amount <= 0 {
        send_ephemeral(&ctx, "Amount must be positive.").await?;
        return Ok(());
    }
    if user.bot {
        send_ephemeral(&ctx, "You cannot take coins from a bot.").await?;
        return Ok(());
    }

    let Some(config) = commands::get_config(&ctx).await? else {
        send_ephemeral(&ctx, "Economy isn't enabled in this server.").await?;
        return Ok(());
    };

    ctx.defer().await?;
    let guild_id = ctx.guild_id().unwrap();
    let db = &ctx.data().core.db;

    // Try deducting directly first!
    let deduct_res = deduct_cash(db, guild_id, user.id, amount).await?;

    let balance = match deduct_res {
        Some(bal) => bal,
        None => {
            // Either insufficient funds or user doesn't exist yet
            let current = get_balance(db, guild_id, user.id).await?;
            send_ephemeral(
                &ctx,
                format!(
                    "**{}** only has **{} {}** in their wallet, cannot take **{} {}**.",
                    user.display_name(),
                    current.cash,
                    config.currency_name,
                    amount,
                    config.currency_name
                ),
            )
                .await?;
            return Ok(());
        }
    };

    let description = format!("Took **{amount} {}** from **{}**.", config.currency_name, user.display_name());
    send_balance_embed(&ctx, "Coins Taken", &description, &balance, &config.currency_name).await?;
    Ok(())
}

/// Set a user's wallet to an exact amount (admin)
#[poise::command(slash_command, guild_only, required_permissions = "MANAGE_GUILD")]
pub async fn set(
    ctx: Context<'_>,
    #[description = "User whose wallet to set"] user: User,
    #[description = "Exact wallet amount"] amount: i64,
) -> Result<(), Error> {
    if amount < 0 {
        send_ephemeral(&ctx, "Amount cannot be negative.").await?;
        return Ok(());
    }
    if user.bot {
        send_ephemeral(&ctx, "You cannot set a bot's balance.").await?;
        return Ok(());
    }

    let Some(config) = commands::get_config(&ctx).await? else {
        send_ephemeral(&ctx, "Economy isn't enabled in this server.").await?;
        return Ok(());
    };

    ctx.defer().await?;
    let guild_id = ctx.guild_id().unwrap();
    let db = &ctx.data().core.db;

    let balance = set_cash(db, guild_id, user.id, amount).await?;

    let description = format!("Set **{}**'s wallet to **{amount} {}**.", user.display_name(), config.currency_name);
    send_balance_embed(&ctx, "Wallet Set", &description, &balance, &config.currency_name).await?;
    Ok(())
}

async fn send_balance_embed(
    ctx: &Context<'_>,
    title: &str,
    description: &str,
    balance: &Balance,
    currency_name: &str,
) -> Result<(), Error> {
    let embed = CreateEmbed::new()
        .title(title)
        .description(description)
        .field("Wallet", format!("{} {currency_name}", balance.cash), true)
        .field("Bank", format!("{} {currency_name}", balance.bank), true)
        .field("Total", format!("{} {currency_name}", balance.total()), false)
        .color(BRAND_COLOR);

    ctx.send(poise::CreateReply::default().embed(embed)).await?;
    Ok(())
}