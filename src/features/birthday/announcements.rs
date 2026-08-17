use crate::core::config::guild_ctx::get_guild_ctx;
use crate::features::birthday::placeholders::replace_birthday_placeholders;
use crate::features::birthday::types::BirthdayMember;
use crate::features::birthday::{BirthdayConfig, database};
use crate::shared::embed::build_custom_message;
use anyhow::{Context as _, Result, anyhow};
use serenity::all::{ChannelId, Context, GuildId, RoleId};
use serenity::model::channel::Message;
use serenity::model::id::MessageId;
use sqlx::PgPool;

pub async fn send_birthday_message(
    ctx: &Context,
    channel_id: ChannelId,
    celebrants: &[BirthdayMember],
    birthday_cfg: &BirthdayConfig,
    guild_id: u64,
) -> Result<Message> {
    let gctx = get_guild_ctx(GuildId::new(guild_id), &ctx.http).await?;

    let msg = build_custom_message(
        birthday_cfg.message.format,
        &birthday_cfg.message.content,
        &birthday_cfg.message.embed,
        |t| replace_birthday_placeholders(t, &gctx, celebrants),
    )?
    .ok_or_else(|| anyhow!("Message is not valid"))?;

    channel_id
        .send_message(&ctx.http, msg)
        .await
        .context("Failed to send message")
}

pub struct BirthdayAnnouncement<'a> {
    pub guild_id: u64,
    pub channel_id: ChannelId,
    pub sent_msg_id: Option<MessageId>,
    pub celebrants: &'a [BirthdayMember],
    pub current_year: i32,
}

pub async fn process_celebrant_roles(
    db: &PgPool,
    ctx: &Context,
    birthday_cfg: &BirthdayConfig,
    announcement: BirthdayAnnouncement<'_>,
) {
    let BirthdayAnnouncement {
        guild_id,
        channel_id,
        sent_msg_id,
        celebrants,
        current_year,
    } = announcement;

    if celebrants.is_empty() {
        return;
    }

    let target_guild_id = GuildId::new(guild_id);
    // Parse the role ID once outside the loop instead of every iteration
    let birthday_role_id = birthday_cfg.birthday_role_id.map(RoleId::new);

    for celebrant in celebrants {
        let uid = celebrant.user_id.get();

        let _ =
            database::store_birthday_log(db, current_year, guild_id, channel_id, sent_msg_id, uid)
                .await;

        let Some(role_id) = birthday_role_id else {
            continue;
        };

        let Ok(()) = ctx
            .http
            .add_member_role(
                target_guild_id,
                celebrant.user_id,
                role_id,
                Some("Birthday Role"),
            )
            .await
        else {
            continue;
        };

        let _ = database::save_user_with_birthday_role(db, guild_id, uid, role_id).await;
    }
}
