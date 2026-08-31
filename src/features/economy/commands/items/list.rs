use crate::constants::BRAND_COLOR;
use crate::core::config::state::{Context, Error};
use crate::features::economy::commands::inventory;
use crate::features::economy::{commands, database};
use crate::shared::messages::send_ephemeral;
use crate::shared::pagination;
use serenity::all::{CreateEmbed, CreateEmbedFooter};

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

    let items = database::list_items(db, guild_id).await?;
    if items.is_empty() {
        send_ephemeral(&ctx, "No items in the store.").await?;
        return Ok(());
    }

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
            description.push_str(&format!(
                "{} **{}** — {} {} — {}\n",
                icon, item.name, item.price, currency, stock
            ));
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
