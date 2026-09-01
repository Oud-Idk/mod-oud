use crate::constants::BRAND_COLOR;
use crate::core::config::state::{Context, Error};
use crate::features::economy::commands::inventory;
use crate::features::economy::database::items::{CreateItemParams, create_item};
use crate::features::economy::{commands, validation};
use crate::shared::messages::send_ephemeral;
use serenity::all::CreateEmbed;

/// Create a new store item
#[poise::command(slash_command, guild_only, required_permissions = "MANAGE_GUILD")]
#[allow(clippy::too_many_arguments)]
pub async fn create(
    ctx: Context<'_>,
    #[description = "Item name (3-100 chars)"] name: String,
    #[description = "Price in coins"] price: i64,
    #[description = "Item description"] description: Option<String>,
    #[description = "Emoji for the icon (unicode or custom)"] emoji: Option<String>,
    #[description = "Stock quantity (leave empty for unlimited)"] stock: Option<i32>,
    #[description = "Show in store? (default true)"] listed: Option<bool>,
    #[description = "Add to inventory on buy? (default true)"] inventory: Option<bool>,
    #[description = "Can be used? (default true)"] usable: Option<bool>,
    #[description = "Can be sold back? (default true)"] sellable: Option<bool>,
) -> Result<(), Error> {
    if price < 1 {
        send_ephemeral(&ctx, "Price must be positive.").await?;
        return Ok(());
    }

    if stock.is_some_and(|s| s < 1) {
        send_ephemeral(&ctx, "Stock must be positive.").await?;
        return Ok(());
    }

    ctx.defer().await?;

    let Some(_) = commands::get_config(&ctx).await? else {
        send_ephemeral(&ctx, "Economy isn't enabled in this server.").await?;
        return Ok(());
    };

    let guild_id = ctx.guild_id().unwrap();
    let db = &ctx.data().core.db;

    let (emoji_unicode, emoji_id) = validation::parse_emoji(emoji.as_deref());

    let unlimited_stock = stock.is_none();
    let stock_remaining = stock.unwrap_or(0);
    let is_inventory = inventory.unwrap_or(true);
    let is_usable = is_inventory && usable.unwrap_or(true);
    let is_sellable = is_inventory && sellable.unwrap_or(true);
    let is_listed = listed.unwrap_or(true);

    let payload = CreateItemParams {
        name: &name,
        description: description.as_deref().unwrap_or(""),
        price,
        category_id: None,
        emoji_unicode: emoji_unicode.as_deref(),
        emoji_id: emoji_id.as_deref(),
        is_inventory,
        is_usable,
        is_sellable,
        is_listed,
        unlimited_stock,
        stock_remaining,
        requirements: &serde_json::json!([]),
        actions: &serde_json::json!([]),
        expires_at: None,
    };

    let item = create_item(db, guild_id, payload).await?;

    let mut embed = CreateEmbed::new()
        .title("Item Created!")
        .field("Name", &item.name, true)
        .field("Price", format!("{}", item.price), true)
        .field("Stock", inventory::format_stock(&item), true)
        .color(BRAND_COLOR);

    if !item.description.is_empty() {
        embed = embed.field("Description", &item.description, false);
    }

    if let Some(thumb) = item.thumbnail_url() {
        embed = embed.thumbnail(thumb);
    }

    ctx.send(poise::CreateReply::default().embed(embed)).await?;
    Ok(())
}
