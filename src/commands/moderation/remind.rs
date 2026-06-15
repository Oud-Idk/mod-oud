use crate::types::types::Context;
use serenity::all::Message;

pub async fn send_moderation_dm(
    http: &serenity::all::Http,
    user: &serenity::all::User,
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
            "Moderator name is hidden for privacy.",
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
    user: &serenity::all::User,
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