use crate::constants::BRAND_COLOR;
use crate::core::config::state::{Context, Error};
use crate::features::economy::{commands, database};
use crate::shared::messages::send_ephemeral;
use crate::shared::pagination;
use serenity::all::{CreateEmbed, CreateEmbedFooter, User};

/// View your inventory
#[poise::command(slash_command, guild_only)]
pub async fn inventory(
    ctx: Context<'_>,
    #[description = "The user whose inventory you want to view"] user: Option<User>,
) -> Result<(), Error> {
    let Some(_config) = commands::get_config(&ctx).await? else {
        send_ephemeral(&ctx, "Economy isn't enabled in this server.").await?;
        return Ok(());
    };

    let guild_id = ctx.guild_id().unwrap();
    let target = user.as_ref().unwrap_or_else(|| ctx.author());
    let db = &ctx.data().core.db;

    let entries = database::get_inventory_with_items(db, guild_id, target.id).await?;

    if entries.is_empty() {
        send_ephemeral(&ctx, format!("{} has no items.", target.display_name())).await?;
        return Ok(());
    }

    let per_page = 10;
    let chunks: Vec<_> = entries.chunks(per_page).collect();
    let total_pages = chunks.len();

    pagination::paginate(ctx, total_pages, move |page_idx| {
        let chunk = chunks[page_idx];
        let mut description = String::new();
        for (item, qty) in chunk {
            let icon = item.icon_str().unwrap_or_default();
            let flags = [
                if item.is_usable { "Usable" } else { "" },
                if item.is_sellable { "Sellable" } else { "" },
            ]
            .iter()
            .filter(|s| !s.is_empty())
            .copied()
            .collect::<Vec<_>>()
            .join(", ");
            let flag_str = if flags.is_empty() {
                String::new()
            } else {
                format!(" ({flags})")
            };
            description.push_str(&format!("{} **{}** x{qty}{flag_str}\n", icon, item.name,));
        }
        CreateEmbed::new()
            .title(format!("{}'s Inventory", target.display_name()))
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

pub fn format_stock(item: &crate::features::economy::types::Item) -> String {
    if item.unlimited_stock {
        "Unlimited".to_string()
    } else {
        format!("{} left", item.stock_remaining)
    }
}

pub fn yes_no(val: bool) -> &'static str {
    if val { "Yes" } else { "No" }
}
