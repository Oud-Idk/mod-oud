use crate::constants::BRAND_COLOR;
use crate::core::config::state::{Context, Error};
use crate::features::economy::{commands, database, validation};
use crate::shared::messages::send_ephemeral;
use serenity::all::CreateEmbed;

/// Buy an item from the store
#[poise::command(slash_command, guild_only)]
pub async fn buy(
    ctx: Context<'_>,
    #[description = "Item name or ID"] item_input: String,
    #[description = "Quantity to buy"] quantity: Option<u32>,
) -> Result<(), Error> {
    let qty = quantity.unwrap_or(1) as i32;
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

    let Some(item) = validation::resolve_item(db, guild_id, &item_input).await? else {
        send_ephemeral(&ctx, "Item not found.").await?;
        return Ok(());
    };

    if let Err(reason) = validation::validate_buy_requirements(&ctx, &item, db).await? {
        send_ephemeral(&ctx, format!("**Purchase Denied:** {reason}")).await?;
        return Ok(());
    }

    let total_cost = item.price * (qty as i64);

    let result =
        database::purchase_item_tx(db, guild_id, user_id, item.id, qty, total_cost).await?;

    match result {
        Ok((bought_item, balance)) => {
            let currency = &config.currency_name;
            let icon = bought_item.icon_str().unwrap_or_default();

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
        Err(database::PurchaseError::InsufficientStock { remaining }) => {
            send_ephemeral(
                &ctx,
                format!("Not enough stock. Only {remaining} remaining."),
            )
            .await?;
        }
        Err(database::PurchaseError::InsufficientFunds { wallet }) => {
            send_ephemeral(
                &ctx,
                format!(
                    "You need {} {} in your wallet, but only have {}.",
                    total_cost, config.currency_name, wallet
                ),
            )
            .await?;
        }
        Err(database::PurchaseError::ItemNotFoundOrExpired) => {
            send_ephemeral(&ctx, "This item is no longer available.").await?;
        }
    }

    Ok(())
}

// Re-export for backwards compatibility if external code imported via buy module
pub use super::actions::execute_buy_actions;
