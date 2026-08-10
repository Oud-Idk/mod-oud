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

use crate::{Context, Error};
use rename::rename;
use kick::kick;
use limit::limit;
use delete::delete;
use transfer::transfer;
use lock::lock;
use unlock::unlock;
use trust::trust;
use untrust::untrust;
use block::block;
use unblock::unblock;
use invite::invite;

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