use crate::commands::moderation::remind;
use crate::types::types::{Context, Error};
use poise::serenity_prelude as serenity;
use ::serenity::model::channel::Message;

/// Common metadata extracted from a guild-only command context.
pub struct GuildMetadata {
    pub id: serenity::GuildId,
    pub name: String,
    pub author_id: serenity::UserId,
}

impl GuildMetadata {
    /// Safely extracts guild ID, guild name, and author ID from the context.
    pub fn extract(ctx: &Context<'_>) -> Result<Self, Error> {
        let guild_id = ctx
            .guild_id()
            .ok_or("This command must be executed within a server")?;

        let guild_name = ctx
            .guild()
            .map(|g| g.name.clone())
            .ok_or("Failed to retrieve guild information")?;

        Ok(Self {
            id: guild_id,
            name: guild_name,
            author_id: ctx.author().id,
        })
    }
}

/// Attempts to DM a user about a moderation action during event handling.
/// Designed for use inside general Serenity event hooks.
pub async fn try_dm_message_action(
    ctx: &serenity::Context,
    guild_id: Option<serenity::all::GuildId>,
    user: &serenity::User,
    title: String,
    color: u32,
    reason: &str,
    extra_fields: &[(&str, &str)],
) -> Result<Message, serenity::Error> {
    let mut guild_icon = None;
    if let Some(id) = guild_id {
        if let Ok(partial_guild) = id.to_partial_guild(&ctx.http).await {
            guild_icon = partial_guild.icon_url();
        }
    }

    return remind::send_moderation_dm(
        &ctx.http,
        user,
        guild_icon,
        title,
        color,
        reason,
        extra_fields,
    )
        .await;
}
