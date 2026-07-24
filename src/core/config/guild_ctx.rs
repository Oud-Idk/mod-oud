use serenity::all::CacheHttp;
use tracing::{debug, trace};

pub struct GuildCtx {
    pub name: String,
    pub id: String,
    pub icon_url: String,
    pub icon_hash: String,
    pub owner_id: String,
    pub member_count: String,
    pub verification_level: String,
    pub joined_at: String,
}

pub async fn get_guild_ctx(
    guild_id: serenity::all::GuildId,
    cache_http: impl CacheHttp,
) -> Result<GuildCtx, anyhow::Error> {
    let guild_id_u64 = guild_id.get();
    trace!(guild_id = guild_id_u64, "Fetching guild context details");

    if let Some(cache) = cache_http.cache() {
        if let Some(g) = guild_id.to_guild_cached(cache) {
            trace!(guild_id = guild_id_u64, "Retrieved guild context from local cache");
            return Ok(GuildCtx {
                name: g.name.clone(),
                id: g.id.to_string(),
                icon_url: g.icon_url().unwrap_or_default(),
                icon_hash: g.icon.map(|h| h.to_string()).unwrap_or_default(),
                owner_id: g.owner_id.to_string(),
                member_count: g.member_count.to_string(),
                verification_level: u8::from(g.verification_level).to_string(),
                joined_at: g.joined_at.to_string(),
            });
        }
    }

    debug!(
        guild_id = guild_id_u64,
        "Guild context not found in local cache; executing fallback HTTP request to Discord API"
    );
    let g = cache_http.http().get_guild_with_counts(guild_id).await?;
    Ok(GuildCtx {
        name: g.name.clone(),
        id: g.id.to_string(),
        icon_url: g.icon_url().unwrap_or_default(),
        icon_hash: g.icon.map(|h| h.to_string()).unwrap_or_default(),
        owner_id: g.owner_id.to_string(),
        member_count: g.approximate_member_count.unwrap_or(0).to_string(),
        verification_level: u8::from(g.verification_level).to_string(),
        joined_at: String::new(), // HTTP fetch doesn't give us joined_at
    })
}