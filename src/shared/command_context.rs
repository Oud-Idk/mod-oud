use crate::core::config::state::Context;
use anyhow::Context as _;
use anyhow::Result;

/// Common metadata extracted from a guild-only command context.
pub struct GuildMetadata {
    pub id: serenity::all::GuildId,
    pub name: String,
    pub author_id: serenity::all::UserId,
    pub icon_url: Option<String>,
}

impl GuildMetadata {
    /// Safely extracts guild ID, guild name, and author ID from the context.
    pub fn extract(ctx: &Context<'_>) -> Result<Self> {
        let guild_id = ctx
            .guild_id()
            .with_context(|| "This command must be executed within a server")?;

        let guild_name = ctx
            .guild()
            .map(|g| g.name.clone())
            .with_context(|| "Failed to retrieve guild information")?;

        let guild_icon = ctx
            .guild()
            .map(|g| g.icon_url())
            .with_context(|| "Failed to retrieve guild information")?;

        Ok(Self {
            id: guild_id,
            name: guild_name,
            author_id: ctx.author().id,
            icon_url: guild_icon,
        })
    }
}