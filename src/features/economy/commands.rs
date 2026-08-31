#![allow(
    missing_docs,
    clippy::unused_async,
    clippy::format_push_string,
    clippy::option_if_let_else
)]

pub mod admin;
pub mod cash;
pub mod inventory;
pub mod items;
pub mod leaderboard;

use super::commands::admin::admin;
use super::commands::cash::cash;
use super::commands::inventory::inventory;
use super::commands::items::items;
use super::commands::leaderboard::leaderboard;
use crate::core::config::settings::get_settings;
use crate::core::config::state::{Context, Error};
use crate::features::economy::types::EconomyConfig;

async fn get_config(ctx: &Context<'_>) -> Result<Option<EconomyConfig>, Error> {
    let guild_id = ctx
        .guild_id()
        .ok_or_else(|| anyhow::anyhow!("Must be run in a guild"))?;
    let redis = &ctx.data().core.redis;
    let db = &ctx.data().core.db;
    let guild_configs_cache = &ctx.data().core.guild_configs_cache;
    let settings = get_settings(db, redis, guild_configs_cache, guild_id).await?;
    Ok(settings.economy.filter(|e| e.enabled).map(|e| *e))
}

/// Economy commands
#[poise::command(slash_command, guild_only, subcommands("cash", "inventory", "items", "admin", "leaderboard"))]
pub async fn economy(_: Context<'_>) -> Result<(), Error> {
    Ok(())
}
