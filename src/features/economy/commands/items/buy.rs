use crate::constants::BRAND_COLOR;
use crate::core::config::state::{Context, Error};
use crate::features::economy::database::shop::{PurchaseError, purchase_item_tx};
use crate::features::economy::{commands, ensure_balance, validation};
use crate::shared::messages::send_ephemeral;
use serenity::all::CreateEmbed;

// Re-export for backwards compatibility if external code imported via buy module
pub use super::actions::execute_buy_actions;

/// Buy an item from the store
#[poise::command(slash_command, guild_only)]
pub async fn buy(
    ctx: Context<'_>,
    #[description = "Item name or ID"] item_input: String,
    #[description = "Quantity to buy"] quantity: Option<u32>,
) -> Result<(), Error> {
    let raw_qty = quantity.unwrap_or(1);

    let Ok(qty) = i32::try_from(raw_qty) else {
        send_ephemeral(&ctx, "Quantity is too large.").await?;
        return Ok(());
    };

    if qty <= 0 {
        send_ephemeral(&ctx, "Quantity must be at least 1.").await?;
        return Ok(());
    }

    ctx.defer().await?;

    let Some(config) = commands::get_config(&ctx).await? else {
        send_ephemeral(&ctx, "Economy isn't enabled in this server.").await?;
        return Ok(());
    };

    let guild_id = ctx.guild_id().unwrap();
    let user_id = ctx.author().id;
    let db = &ctx.data().core.db;

    // Seed starting balance before any balance checks
    ensure_balance(db, guild_id, user_id, config.starting_balance).await?;

    let Some(item) = validation::resolve_item(db, guild_id, &item_input).await? else {
        send_ephemeral(&ctx, "Item not found.").await?;
        return Ok(());
    };

    if let Err(reason) = validation::validate_buy_requirements(&ctx, &item, db).await? {
        send_ephemeral(&ctx, format!("**Purchase Denied:** {reason}")).await?;
        return Ok(());
    }

    let result = purchase_item_tx(db, guild_id, user_id, item.id, qty).await?;

    match result {
        Ok((bought_item, balance)) => {
            let currency = &config.currency_name;
            let icon = bought_item.icon_str().unwrap_or_default();
            let total_cost = bought_item.price * i64::from(qty);

            // Execute hooks/roles/actions tied to the item purchase
            execute_buy_actions(&ctx, &bought_item, qty).await?;

            let mut embed = CreateEmbed::new()
                .title(format!("{icon} Purchase Complete!").trim().to_string())
                .description(format!(
                    "You bought **{qty}x {}** for **{total_cost} {currency}**!",
                    bought_item.name,
                ))
                .field("Wallet", format!("{} {currency}", balance.cash), true)
                .field("Bank", format!("{} {currency}", balance.bank), true)
                .color(BRAND_COLOR);

            if let Some(thumb) = bought_item.thumbnail_url() {
                embed = embed.thumbnail(thumb);
            }

            ctx.send(poise::CreateReply::default().embed(embed)).await?;
        }
        Err(PurchaseError::InvalidQuantity) => {
            send_ephemeral(&ctx, "Invalid quantity or total price is too large.").await?;
        }
        Err(PurchaseError::InsufficientStock { remaining }) => {
            send_ephemeral(
                &ctx,
                format!("Not enough stock! Only **{remaining}** remaining."),
            )
            .await?;
        }
        Err(PurchaseError::InsufficientFunds { wallet }) => {
            let total_cost = item.price.saturating_mul(i64::from(qty));
            send_ephemeral(
                &ctx,
                format!(
                    "You need **{} {}** in your wallet, but you only have **{}**.",
                    total_cost, config.currency_name, wallet
                ),
            )
            .await?;
        }
        Err(PurchaseError::ItemNotFoundOrExpired) => {
            send_ephemeral(&ctx, "This item is no longer available.").await?;
        }
    }

    Ok(())
}
