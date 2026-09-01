use crate::constants::BRAND_COLOR;
use crate::core::config::state::{Context, Error};
use crate::features::economy::commands;
use crate::features::economy::commands::inventory;
use crate::features::economy::database::categories::list_categories;
use crate::features::economy::database::items::list_items;
use crate::shared::messages::send_ephemeral;
use crate::shared::pagination;
use serenity::all::{CreateEmbed, CreateEmbedFooter};
use std::collections::HashMap;
use std::fmt::Write;

/// View all items in the store
#[poise::command(slash_command, guild_only)]
pub async fn list(ctx: Context<'_>) -> Result<(), Error> {
    ctx.defer().await?;

    let Some(config) = commands::get_config(&ctx).await? else {
        send_ephemeral(&ctx, "Economy isn't enabled in this server.").await?;
        return Ok(());
    };

    let guild_id = ctx.guild_id().unwrap();
    let db = &ctx.data().core.db;

    let items = list_items(db, guild_id).await?;
    if items.is_empty() {
        send_ephemeral(&ctx, "No items in the store.").await?;
        return Ok(());
    }

    let categories = list_categories(db, guild_id).await.unwrap_or_default();
    let category_map: HashMap<_, _> = categories.into_iter().map(|c| (c.id, c.name)).collect();

    let per_page = 10;
    let chunks: Vec<_> = items.chunks(per_page).collect();
    let total_pages = chunks.len();
    let currency = config.currency_name.clone();

    pagination::paginate(ctx, total_pages, move |page_idx| {
        let chunk = chunks[page_idx];
        let mut description = String::new();
        for item in chunk {
            let icon = item.icon_str().unwrap_or_default();
            let stock = inventory::format_stock(item);
            let category_label = item
                .category_id
                .and_then(|cid| category_map.get(&cid))
                .map(|name| format!(" - *{name}*"))
                .unwrap_or_default();
            let _ = writeln!(
                description,
                "{} **{}**: {} {} | {}{}",
                icon, item.name, item.price, currency, stock, category_label
            );
        }
        CreateEmbed::new()
            .title("Store Items")
            .description(description)
            .color(BRAND_COLOR)
            .footer(CreateEmbedFooter::new(format!(
                "Page {} of {}",
                page_idx + 1,
                total_pages
            )))
    })
    .await?;

    Ok(())
}
