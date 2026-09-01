#![allow(missing_docs, clippy::unused_async)]

use crate::core::config::state::{Context, Error};
use blackjack::blackjack;
use coinflip::coinflip;
use higherlower::higherlower;
use roulette::roulette;
use slots::slots;

pub mod blackjack;
pub mod coinflip;
pub mod higherlower;
pub mod roulette;
pub mod slots;

/// Gambling commands suite
#[poise::command(
    slash_command,
    subcommands("blackjack", "coinflip", "higherlower", "roulette", "slots"),
    guild_only
)]
pub async fn games(_: Context<'_>) -> Result<(), Error> {
    Ok(())
}
