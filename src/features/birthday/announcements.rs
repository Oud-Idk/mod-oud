use crate::core::config::guild_ctx::get_guild_ctx;
use crate::features::birthday::placeholders::replace_birthday_placeholders;
use crate::features::birthday::types::BirthdayMember;
use crate::features::birthday::{BirthdayConfig, database};
use serenity::all::{ChannelId, Context, CreateMessage, GuildId, RoleId};
use sqlx::PgPool;

pub async fn send_birthday_message(
    ctx: &Context,
    channel_id: ChannelId,
    celebrants: &[BirthdayMember],
    birthday_cfg: &BirthdayConfig,
    guild_id: i64,
) -> Option<i64> {
    let gctx = get_guild_ctx(GuildId::from(guild_id as u64), &ctx.http).await.ok()?;

    let has_birth_year = celebrants.iter().any(|c| c.birth_year.is_some());
    let payload = if has_birth_year {
        &birthday_cfg.message_with_year
    } else {
        &birthday_cfg.message_without_year
    };

    let raw_content = payload.get("content").and_then(|v| v.as_str()).unwrap_or("");
    let rendered_content = replace_birthday_placeholders(raw_content, &gctx, celebrants);

    let create_msg = CreateMessage::new().content(rendered_content);
    channel_id
        .send_message(&ctx.http, create_msg)
        .await
        .ok()
        .map(|msg| msg.id.get() as i64)
}

pub async fn process_celebrant_roles(
    db: &PgPool,
    ctx: &Context,
    celebrants: &[BirthdayMember],
    birthday_cfg: &BirthdayConfig,
    guild_id: i64,
    channel_id: ChannelId,
    sent_msg_id: Option<i64>,
    current_year: i32,
) {
    if celebrants.is_empty() {
        return;
    }

    let target_guild_id = GuildId::new(guild_id as u64);
    // Parse the role ID once outside the loop instead of every iteration
    let birthday_role_id = birthday_cfg.birthday_role_id.map(RoleId::new);

    for celebrant in celebrants {
        let uid = celebrant.user_id.get() as i64;

        let _ = database::store_birthday_log(db, current_year, guild_id, channel_id, sent_msg_id, uid).await;

        let Some(role_id) = birthday_role_id else {
            continue;
        };

        let Ok(()) = ctx
            .http
            .add_member_role(target_guild_id, celebrant.user_id, role_id, Some("Birthday Role"))
            .await
        else {
            continue;
        };

        let _ = database::save_user_with_birthday_role(db, guild_id, uid, role_id).await;
    }
}