use anyhow::Result;
use serenity::all::{CacheHttp, GuildId, VerificationLevel};
use tracing::{debug, trace};

/// Contextual details for a Discord Guild (Server).
#[derive(Debug, Clone)]
pub struct GuildCtx {
    /// The name of the guild.
    pub name: String,

    /// The guild snowflake ID.
    pub id: String,

    /// The guild icon URL (if any).
    pub icon_url: Option<String>,

    /// The guild icon has (if any).
    pub icon_hash: Option<String>,

    /// The snowflake ID of the owner user.
    pub owner_id: String,

    /// The estimated member count of a guild.
    pub member_count: u64,

    /// The verification level needed to interact in the guild (low, medium, high, etc).
    pub verification_level: VerificationLevel,

    /// The date the current user joined the guild.
    pub joined_at: Option<String>,
}

/// Fetches `GuildCtx` for a given `GuildId`.
///
/// Tries the local cache first for fast lookup, then falls back to a Discord REST API request.
///
/// # Note
/// When fetched via HTTP fallback, `joined_at` will be `None` and `member_count`
/// will represent the *approximate* member count.
///
/// # Errors
/// Returns an `Err` if the HTTP fallback fails to retrieve guild data from Discord API.
pub async fn get_guild_ctx(guild_id: GuildId, cache_http: impl CacheHttp) -> Result<GuildCtx> {
    trace!(%guild_id, "Fetching guild context details");

    if let Some(g) = cache_http.cache().and_then(|c| guild_id.to_guild_cached(c)) {
        trace!(%guild_id, "Retrieved guild context from local cache");

        return Ok(GuildCtx {
            name: g.name.clone(),
            id: g.id.to_string(),
            icon_url: g.icon_url(),
            icon_hash: g.icon.map(|h| h.to_string()),
            owner_id: g.owner_id.to_string(),
            member_count: g.member_count,
            verification_level: g.verification_level,
            joined_at: Some(g.joined_at.to_string()),
        });
    }

    debug!(
        %guild_id,
        "Guild context not in local cache; executing HTTP fallback request"
    );

    let g = cache_http.http().get_guild_with_counts(guild_id).await?;

    Ok(GuildCtx {
        name: g.name.clone(),
        id: g.id.to_string(),
        icon_url: g.icon_url(),
        icon_hash: g.icon.map(|h| h.to_string()),
        owner_id: g.owner_id.to_string(),
        member_count: g.approximate_member_count.unwrap_or(0),
        verification_level: g.verification_level,
        joined_at: None, // HTTP fetch doesn't yield joined_at
    })
}
