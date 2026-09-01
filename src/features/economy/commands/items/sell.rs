use crate::constants::BRAND_COLOR;
use crate::core::config::state::{Context, Error};
use crate::features::economy::database::shop::{SellError, sell_item_tx};
use crate::features::economy::{commands, ensure_balance, validation};
use crate::shared::messages::send_ephemeral;
use serenity::all::CreateEmbed;

/// Sell an item from your inventory back to the store
#[poise::command(slash_command, guild_only)]
pub async fn sell(
    ctx: Context<'_>,
    #[description = "Item name or ID"] item_input: String,
    #[description = "Quantity to sell"] quantity: Option<i32>,
) -> Result<(), Error> {
    let qty = quantity.unwrap_or(1);
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

    ensure_balance(db, guild_id, user_id, config.starting_balance).await?;

    let Some(item) = validation::resolve_item(db, guild_id, &item_input).await? else {
        send_ephemeral(&ctx, "Item not found.").await?;
        return Ok(());
    };

    let result = sell_item_tx(db, guild_id, user_id, item.id, qty).await?;

    match result {
        Ok((sold_item, balance)) => {
            let currency = &config.currency_name;
            let total_refund = sold_item.price.saturating_mul(i64::from(qty));
            let icon = sold_item.icon_str().unwrap_or_default();

            let mut embed = CreateEmbed::new()
                .title(format!("{icon} Sold!").trim().to_string())
                .description(format!(
                    "You sold **{qty}x {}** for **{total_refund} {currency}**!",
                    sold_item.name,
                ))
                .field("Wallet", format!("{} {currency}", balance.cash), true)
                .field("Bank", format!("{} {currency}", balance.bank), true)
                .color(BRAND_COLOR);

            if let Some(thumb) = sold_item.thumbnail_url() {
                embed = embed.thumbnail(thumb);
            }

            ctx.send(poise::CreateReply::default().embed(embed)).await?;
        }
        Err(SellError::InvalidQuantity) => {
            send_ephemeral(&ctx, "Invalid quantity or total price is too large.").await?;
        }
        Err(SellError::NotSellable) => {
            send_ephemeral(&ctx, "This item cannot be sold back to the shop.").await?;
        }
        Err(SellError::InsufficientQuantity { owned }) => {
            if owned == 0 {
                send_ephemeral(&ctx, format!("You don't own any **{}**.", item.name)).await?;
            } else {
                send_ephemeral(
                    &ctx,
                    format!(
                        "You only have **{owned}x {}**, but tried to sell **{qty}**.",
                        item.name
                    ),
                )
                .await?;
            }
        }
        Err(SellError::ItemNotFound) => {
            send_ephemeral(&ctx, "This item is no longer available.").await?;
        }
    }

    Ok(())
}
