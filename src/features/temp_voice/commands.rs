mod rename;
mod kick;
mod limit;
mod delete;
mod transfer;
mod lock;
mod unlock;
mod trust;
mod untrust;
mod block;
mod unblock;
mod invite;

use crate::core::config::state::{Context, Error};
use block::block;
use delete::delete;
use invite::invite;
use kick::kick;
use limit::limit;
use lock::lock;
use rename::rename;
use transfer::transfer;
use trust::trust;
use unblock::unblock;
use unlock::unlock;
use untrust::untrust;

/// Control your temporary voice channel.
#[poise::command(
    slash_command,
    guild_only,
    subcommands(
        "rename",
        "limit",
        "lock",
        "unlock",
        "trust",
        "untrust",
        "block",
        "unblock",
        "kick",
        "delete",
        "transfer",
        "invite",
    )
)]
pub async fn voice(_: Context<'_>) -> Result<(), Error> {
    Ok(())
}