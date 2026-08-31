use crate::constants::BRAND_COLOR;
use crate::core::config::state::{Context, Error};
use crate::features::economy::{commands, database};
use crate::shared::messages::send_ephemeral;
use serenity::all::{CreateEmbed, User};

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

    let balance = database::add_cash(db, guild_id, user.id, amount).await?;

    let embed = CreateEmbed::new()
        .title("Coins Given")
        .description(format!(
            "Gave **{} {}** to **{}**.",
            amount,
            config.currency_name,
            user.display_name()
        ))
        .field("Wallet", format!("{} {}", balance.cash, config.currency_name), true)
        .field("Bank", format!("{} {}", balance.bank, config.currency_name), true)
        .field("Total", format!("{} {}", balance.total(), config.currency_name), false)
        .color(BRAND_COLOR);

    ctx.send(poise::CreateReply::default().embed(embed)).await?;
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

    let Some(balance) = database::deduct_cash(db, guild_id, user.id, amount).await? else {
        let current = database::get_balance(db, guild_id, user.id).await?;
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
    };

    let embed = CreateEmbed::new()
        .title("Coins Taken")
        .description(format!(
            "Took **{} {}** from **{}**.",
            amount,
            config.currency_name,
            user.display_name()
        ))
        .field("Wallet", format!("{} {}", balance.cash, config.currency_name), true)
        .field("Bank", format!("{} {}", balance.bank, config.currency_name), true)
        .field("Total", format!("{} {}", balance.total(), config.currency_name), false)
        .color(BRAND_COLOR);

    ctx.send(poise::CreateReply::default().embed(embed)).await?;
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

    let balance = database::set_cash(db, guild_id, user.id, amount).await?;

    let embed = CreateEmbed::new()
        .title("Wallet Set")
        .description(format!(
            "Set **{}**'s wallet to **{} {}**.",
            user.display_name(),
            amount,
            config.currency_name
        ))
        .field("Wallet", format!("{} {}", balance.cash, config.currency_name), true)
        .field("Bank", format!("{} {}", balance.bank, config.currency_name), true)
        .field("Total", format!("{} {}", balance.total(), config.currency_name), false)
        .color(BRAND_COLOR);

    ctx.send(poise::CreateReply::default().embed(embed)).await?;
    Ok(())
}
