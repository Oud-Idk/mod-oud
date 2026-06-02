use crate::types::{Context, Error};
use ::serenity::model::channel::Message;
use poise::serenity_prelude as serenity;

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

/// Sends a simple ephemeral reply back to the user.
pub async fn send_ephemeral(ctx: &Context<'_>, message: impl Into<String>) -> Result<(), Error> {
    ctx.send(
        poise::CreateReply::default()
            .content(message)
            .ephemeral(true),
    )
    .await?;
    Ok(())
}

pub async fn check_self_moderation(
    ctx: &Context<'_>,
    target_id: serenity::UserId,
    action: &str,
) -> Result<bool, Error> {
    if ctx.author().id == target_id {
        ctx.send(
            poise::CreateReply::default()
                .content(format!("You cannot {} yourself!", action))
                .ephemeral(true),
        )
        .await?;
        return Ok(true);
    }
    Ok(false)
}

async fn send_moderation_dm(
    http: &serenity::Http,
    user: &serenity::User,
    guild_icon: Option<String>,
    title: String,
    color: u32,
    reason: &str,
    extra_fields: &[(&str, &str)],
) -> Result<Message, serenity::Error> {
    let mut embed = poise::serenity_prelude::CreateEmbed::new()
        .title(title)
        .color(color)
        .field("Reason", reason, false)
        .footer(poise::serenity_prelude::CreateEmbedFooter::new(
            "This is an automated moderation action. Moderator name is hidden for privacy.",
        ));

    if let Some(icon) = guild_icon {
        embed = embed.thumbnail(icon);
    }

    for &(name, value) in extra_fields {
        embed = embed.field(name, value, false);
    }

    let message = poise::serenity_prelude::CreateMessage::new().embed(embed);
    return user.dm(http, message).await;
}

/// Attempts to DM a user about a moderation action. Silently ignores errors if DMs are disabled.
/// Designed for use inside Poise command contexts.
pub async fn try_dm_moderation_action(
    ctx: &Context<'_>,
    user: &serenity::User,
    title: String,
    color: u32,
    reason: &str,
    extra_fields: &[(&str, &str)],
) {
    let guild_icon = ctx.guild().and_then(|g| g.icon_url());

    let _ = send_moderation_dm(
        &ctx.serenity_context().http,
        user,
        guild_icon,
        title,
        color,
        reason,
        extra_fields,
    )
    .await;
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

    return send_moderation_dm(
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
