#![allow(missing_docs)]
use crate::core::config::state::{Context, Error};
use crate::features::moderation::channels::delete_entire_category;
use serenity::all::GuildChannel;
use tracing::debug;

/// Deletes an entire category and its channels recursively
#[poise::command(slash_command, default_member_permissions = "MANAGE_CHANNELS", guild_only)]
pub async fn delete_category(
    ctx: Context<'_>,
    #[description = "The category to delete"]
    #[channel_types("Category")]
    category: GuildChannel,
) -> Result<(), Error> {
    ctx.defer().await?;

    let Some(guild_id) = ctx.guild_id() else {
        ctx.say("This command can only be used inside a server.").await?;
        debug!("Command ran in a server.");
        return Ok(());
    };

    let category_name = category.name.clone();

    let deleted_count = delete_entire_category(ctx.http(), guild_id, category.id).await?;

    debug!(category_name, deleted_count, "Purged channels and category");
    let success_msg = format!(
        "**Category Purged!**\nSuccessfully deleted **{category_name}** along with all `{deleted_count}` nested channels."
    );
    ctx.say(success_msg).await?;

    Ok(())
}