use crate::constants::BRAND_COLOR;
use crate::core::config::state::{Context, Error};
use crate::features::economy::{commands, database, validation};
use crate::shared::messages::send_ephemeral;
use serenity::all::CreateEmbed;

use super::actions::execute_use_actions;

/// Use an item from your inventory
#[poise::command(slash_command, guild_only, rename = "use")]
pub async fn use_item(
    ctx: Context<'_>,
    #[description = "Item name or ID"] item_input: String,
    #[description = "Quantity to use"] quantity: Option<u32>,
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

    database::ensure_balance(db, guild_id, user_id, config.starting_balance).await?;

    let Some(item) = validation::resolve_item(db, guild_id, &item_input).await? else {
        send_ephemeral(&ctx, "Item not found.").await?;
        return Ok(());
    };

    if !item.is_usable {
        send_ephemeral(&ctx, "This item cannot be used.").await?;
        return Ok(());
    }

    // Verify ownership
    let inv_row = database::get_inventory_item(db, guild_id, user_id, item.id).await?;
    let owned = inv_row.map_or(0, |r| r.quantity);
    if owned < qty {
        if owned == 0 {
            send_ephemeral(&ctx, format!("You don't own **{}**.", item.name)).await?;
        } else {
            send_ephemeral(
                &ctx,
                format!(
                    "You only have **{owned}x {}**, but tried to use **{qty}**.",
                    item.name
                ),
            )
            .await?;
        }
        return Ok(());
    }

    if let Err(reason) = validation::validate_use_requirements(&ctx, &item, db).await? {
        send_ephemeral(&ctx, format!("**Cannot use:** {reason}")).await?;
        return Ok(());
    }

    // Consume the item(s) from inventory
    database::remove_inventory_item(db, guild_id, user_id, item.id, qty).await?;

    // Execute use-triggered actions (roles, balance, items, messages)
    execute_use_actions(&ctx, &item, qty).await?;

    let icon = item.icon_str().unwrap_or_default();
    let mut embed = CreateEmbed::new()
        .title(format!("{icon} Item Used!").trim().to_string())
        .description(format!("You used **{qty}x {}**!", item.name))
        .color(BRAND_COLOR);

    if let Some(thumb) = item.thumbnail_url() {
        embed = embed.thumbnail(thumb);
    }

    ctx.send(poise::CreateReply::default().embed(embed)).await?;
    Ok(())
}
