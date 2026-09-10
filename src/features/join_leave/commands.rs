#![allow(missing_docs)]

use anyhow::Context as _;
use poise::CreateReply;
use serenity::all::{CreateAttachment, CreateEmbed, Embed};

use crate::core::config::guild_ctx::get_guild_ctx;
use crate::core::config::settings::get_settings;
use crate::core::config::state::{Context, Error};
use crate::features::join_leave::image::{generate_leave_card, generate_welcome_card};
use crate::features::join_leave::messages;

#[derive(Debug, poise::ChoiceParameter)]
pub enum MemberMessageType {
    #[name = "Public Welcome (Channel)"]
    Public,
    #[name = "Private Welcome (DM)"]
    Private,
    #[name = "Leave / Goodbye"]
    Leave,
}

/// Test and preview your server's welcome or goodbye message layouts and cards.
#[poise::command(slash_command, guild_only, required_permissions = "MANAGE_GUILD")]
pub async fn test_member_message(
    ctx: Context<'_>,
    #[description = "The message type you want to preview"] message_type: MemberMessageType,
) -> Result<(), Error> {
    ctx.defer_ephemeral().await?;

    let guild_id = ctx.guild_id().with_context(|| "Must be run in a guild")?;
    let author = ctx
        .author_member()
        .await
        .with_context(|| "Member context missing")?;
    let channel = ctx
        .channel_id()
        .to_channel(&ctx.serenity_context())
        .await?
        .guild()
        .with_context(|| "Guild channel required")?;
    let gctx = get_guild_ctx(guild_id, &ctx).await?;

    let core = &ctx.data().core;
    let settings = get_settings(&core.db, &core.redis, &core.guild_configs_cache, guild_id).await?;
    let mut reply = CreateReply::default().ephemeral(true);
    let name = author
        .user
        .global_name
        .as_deref()
        .unwrap_or(&author.user.name);

    match message_type {
        MemberMessageType::Public | MemberMessageType::Private => {
            let Some(cfg) = &settings.welcome else {
                ctx.send(reply.content("❌ Welcome settings are not configured!"))
                    .await?;
                return Ok(());
            };

            let is_dm = matches!(message_type, MemberMessageType::Private);
            let Some(msg_cfg) = (if is_dm { &cfg.private } else { &cfg.public }).as_ref() else {
                ctx.send(reply.content(format!("❌ {message_type:?} settings not found!")))
                    .await?;
                return Ok(());
            };

            let note = if msg_cfg.enabled.unwrap_or(false) {
                Default::default()
            } else {
                "*(Note: This welcome message is currently disabled in settings)*\n\n"
            };

            let msg =
                messages::build_welcome_message(msg_cfg, &author, &channel, &gctx, note, is_dm)?;
            if msg_cfg.send_image
                && let Some(b) = generate_welcome_card(
                    name,
                    &author.user.face(),
                    gctx.member_count,
                    &gctx.name,
                    &msg_cfg.image_style,
                )
                .await
            {
                reply = reply.attachment(CreateAttachment::bytes(b, "welcome_preview.png"));
            }
            apply_message_to_reply(msg, &mut reply);
        }

        MemberMessageType::Leave => {
            let Some(cfg) = &settings.leave else {
                ctx.send(reply.content("❌ Leave settings are not configured!"))
                    .await?;
                return Ok(());
            };

            let msg = messages::build_goodbye_message(
                ctx.serenity_context(),
                guild_id,
                &author.user,
                Some(&author),
                cfg,
            )
            .await;
            if cfg.message.send_image
                && let Some(b) = generate_leave_card(
                    name,
                    &author.user.face(),
                    gctx.member_count,
                    &gctx.name,
                    &cfg.message.image_style,
                )
                .await
            {
                reply = reply.attachment(CreateAttachment::bytes(b, "leave_preview.png"));
            }
            apply_message_to_reply(msg, &mut reply);
        }
    }

    ctx.send(reply).await?;
    Ok(())
}

/// Helper to forward Serenity `CreateMessage` components into Poise `CreateReply`
fn apply_message_to_reply(builder: serenity::all::CreateMessage, reply: &mut poise::CreateReply) {
    if let Ok(value) = serde_json::to_value(builder) {
        if let Some(content) = value.get("content").and_then(|c| c.as_str()) {
            *reply = std::mem::take(reply).content(content);
        }

        if let Some(embeds) = value.get("embeds").and_then(|e| e.as_array()) {
            for embed_val in embeds {
                if let Ok(embed) = serde_json::from_value::<Embed>(embed_val.clone()) {
                    *reply = std::mem::take(reply).embed(CreateEmbed::from(embed));
                }
            }
        }
    }
}
