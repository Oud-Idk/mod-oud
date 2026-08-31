use crate::constants::BRAND_COLOR;
use crate::core::config::state::{Context, Error};
use crate::features::economy::{commands, database, validation};
use crate::shared::messages::send_ephemeral;
use serenity::all::CreateEmbed;

/// Delete a store item
#[poise::command(slash_command, guild_only, required_permissions = "MANAGE_GUILD")]
pub async fn delete(
    ctx: Context<'_>,
    #[description = "Item name or ID"] item_input: String,
) -> Result<(), Error> {
    ctx.defer().await?;

    let Some(_config) = commands::get_config(&ctx).await? else {
        send_ephemeral(&ctx, "Economy isn't enabled in this server.").await?;
        return Ok(());
    };

    let guild_id = ctx.guild_id().unwrap();
    let db = &ctx.data().core.db;

    let Some(item) = validation::resolve_item(db, guild_id, &item_input).await? else {
        send_ephemeral(&ctx, "Item not found.").await?;
        return Ok(());
    };

    let deleted = database::delete_item(db, guild_id, item.id).await?;
    if deleted == 0 {
        send_ephemeral(&ctx, "Failed to delete item.").await?;
        return Ok(());
    }

    let embed = CreateEmbed::new()
        .title("Item Deleted")
        .description(format!("**{}** has been deleted.", item.name))
        .color(BRAND_COLOR);

    ctx.send(poise::CreateReply::default().embed(embed)).await?;
    Ok(())
}
