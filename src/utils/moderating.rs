use crate::core::config::{get_guild_ctx, get_settings, replace_warn_placeholders};
use crate::types::config::config::Format;
use crate::utils::custom_msg::build_custom_message;
use poise::serenity_prelude as serenity;
use std::sync::Arc;

pub async fn issue_warning(
    db: &sqlx::PgPool,
    redis_conn: &redis::aio::MultiplexedConnection, // Pass the active connection!
    http: &Arc<serenity::Http>,
    guild_id: serenity::GuildId,
    user_id: serenity::UserId,
    moderator_id: serenity::UserId,
    reason: &str,
) -> Result<i64, Box<dyn std::error::Error + Send + Sync>> {
    let warn_res = sqlx::query!(
        r#"INSERT INTO warns (guild_id, user_id, moderator_id, reason) VALUES ($1, $2, $3, $4) RETURNING id"#,
        guild_id.get() as i64, user_id.get() as i64, moderator_id.get() as i64, reason
    ).fetch_one(db).await?;
    let warn_id = warn_res.id;

    let gctx = get_guild_ctx(guild_id, http.as_ref()).await?;
    let member = http.get_member(guild_id, user_id).await?;
    let moderator_user = http.get_user(moderator_id).await.unwrap_or_else(|_| member.user.clone());

    let settings = get_settings(db, redis_conn, guild_id.get() as i64).await?;
    let warn_dm_settings_opt = settings.moderation_dms.and_then(|m| m.warn);

    let mut custom_msg_opt = None;
    if let Some(warn_dm_settings) = warn_dm_settings_opt {
        let is_embed = matches!(warn_dm_settings.format, Format::Embed);

        custom_msg_opt = build_custom_message(
            is_embed,
            Some(&warn_dm_settings.content),
            warn_dm_settings.embed.as_ref(),
            |text| replace_warn_placeholders(text, &gctx, &member, reason, &moderator_user),
        ).unwrap_or_else(|e| {
            eprintln!("Failed to build custom warn message: {}", e);
            None
        });
    }

    let builder = custom_msg_opt.unwrap_or_else(|| {
        let embed = serenity::CreateEmbed::new()
            .title(format!("You have been formally warned from {}", gctx.name))
            .color(0xFF4747)
            .field("Reason", reason, false)
            .field("ID", warn_id.to_string(), false)
            .thumbnail(&gctx.icon_url)
            .footer(serenity::CreateEmbedFooter::new(
                "This is an automated moderation action. If you believe this was a mistake, please create a ticket on the server.",
            ));
        serenity::CreateMessage::new().embed(embed)
    });

    let _ = user_id.dm(http, builder).await;

    Ok(warn_id as i64)
}