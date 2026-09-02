use crate::constants::BRAND_COLOR;
use crate::core::config::state::{Context, Error};
use crate::features::economy::commands;
use crate::features::economy::database::inventory::{GiftError, gift_item_tx};
use crate::features::economy::{ensure_balance, validation};
use crate::shared::messages::send_ephemeral;
use serenity::all::{CreateEmbed, User};

/// Gift an item from your inventory to another user
#[poise::command(slash_command, guild_only)]
pub async fn gift(
    ctx: Context<'_>,
    #[description = "User to gift to"] user: User,
    #[description = "Item name or ID"] item_input: String,
    #[description = "Quantity to gift"] quantity: Option<i32>,
) -> Result<(), Error> {
    let qty = quantity.unwrap_or(1);
    if qty <= 0 {
        send_ephemeral(&ctx, "Quantity must be at least 1.").await?;
        return Ok(());
    }

    if user.id == ctx.author().id {
        send_ephemeral(&ctx, "You cannot gift items to yourself.").await?;
        return Ok(());
    }

    if user.bot {
        send_ephemeral(&ctx, "You cannot gift items to a bot.").await?;
        return Ok(());
    }

    let Some(config) = commands::get_config(&ctx).await? else {
        send_ephemeral(&ctx, "Economy isn't enabled in this server.").await?;
        return Ok(());
    };

    if !config.gifting_enabled {
        send_ephemeral(&ctx, "Item gifting is disabled in this server.").await?;
        return Ok(());
    }

    ctx.defer().await?;

    let guild_id = ctx.guild_id().unwrap();
    let from_user = ctx.author().id;
    let to_user = user.id;
    let db = &ctx.data().core.db;

    ensure_balance(db, guild_id, from_user, config.starting_balance).await?;

    let Some(item) = validation::resolve_item(db, guild_id, &item_input).await? else {
        send_ephemeral(&ctx, "Item not found.").await?;
        return Ok(());
    };

    if !item.is_inventory {
        send_ephemeral(&ctx, "This item cannot be gifted.").await?;
        return Ok(());
    }

    let result = gift_item_tx(db, guild_id, from_user, to_user, item.id, qty).await?;

    match result {
        Ok(gifted_item) => {
            let icon = gifted_item.icon_str().unwrap_or_default();
            let mut embed = CreateEmbed::new()
                .title(format!("{icon} Gift Sent!").trim().to_string())
                .description(format!(
                    "You gifted **{qty}x {}** to **{}**!",
                    gifted_item.name,
                    user.display_name()
                ))
                .color(BRAND_COLOR);

            if let Some(thumb) = gifted_item.thumbnail_url() {
                embed = embed.thumbnail(thumb);
            }

            ctx.send(poise::CreateReply::default().embed(embed)).await?;
        }
        Err(GiftError::InvalidQuantity) => {
            send_ephemeral(&ctx, "Invalid quantity.").await?;
        }
        Err(GiftError::ItemNotFound) => {
            send_ephemeral(&ctx, "This item is no longer available.").await?;
        }
        Err(GiftError::NotGiftable) => {
            send_ephemeral(&ctx, "This item cannot be gifted.").await?;
        }
        Err(GiftError::InsufficientQuantity { owned }) => {
            if owned == 0 {
                send_ephemeral(&ctx, format!("You don't own any **{}**.", item.name)).await?;
            } else {
                send_ephemeral(
                    &ctx,
                    format!(
                        "You only have **{owned}x {}**, but tried to gift **{qty}**.",
                        item.name
                    ),
                )
                .await?;
            }
        }
    }

    Ok(())
}
