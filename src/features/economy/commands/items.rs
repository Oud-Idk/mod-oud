pub mod actions;
pub mod buy;
pub mod create;
pub mod delete;
pub mod gift;
pub mod info;
pub mod list;
pub mod sell;
pub mod use_item;

use buy::buy;
use create::create;
use delete::delete;
use gift::gift;
use info::info;
use list::list;
use sell::sell;
use use_item::use_item;

use crate::core::config::state::{Context, Error};

/// Manage the item store
#[poise::command(
    slash_command,
    guild_only,
    subcommands("create", "delete", "list", "info", "buy", "use_item", "sell", "gift")
)]
pub async fn items(_: Context<'_>) -> Result<(), Error> {
    Ok(())
}
