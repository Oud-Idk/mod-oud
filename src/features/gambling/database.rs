use crate::core::config::settings::get_settings;
use crate::core::config::state::{Context, Error};
use crate::features::gambling::GamblingConfig;

/// Fetch the gambling config for the current guild.
/// Returns `None` when the feature is not configured or `enabled == false`.
pub async fn get_gambling_config(ctx: &Context<'_>) -> Result<Option<GamblingConfig>, Error> {
    let guild_id = ctx
        .guild_id()
        .ok_or_else(|| anyhow::anyhow!("Must be run in a guild"))?;
    let redis = &ctx.data().core.redis;
    let db = &ctx.data().core.db;
    let cache = &ctx.data().core.guild_configs_cache;
    let settings = get_settings(db, redis, cache, guild_id).await?;
    Ok(settings
        .gambling
        .filter(|c| c.enabled)
        .map(|c| *c))
}