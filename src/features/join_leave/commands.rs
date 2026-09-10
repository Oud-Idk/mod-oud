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
#[poise::command(
    slash_command,
    guild_only,
    required_permissions = "MANAGE_GUILD"
)]
pub async fn test_member_message(
    ctx: Context<'_>,
    #[description = "The message type you want to preview"] message_type: MemberMessageType,
) -> Result<(), Error> {
    ctx.defer_ephemeral().await?;

    let guild_id = ctx.guild_id().with_context(|| "Must be run in a guild")?;
    let author_member = ctx.author_member().await.with_context(|| "Member context missing")?;

    let channel = ctx.channel_id()
        .to_channel(&ctx.serenity_context())
        .await?
        .guild()
        .with_context(|| "Guild channel required")?;

    let gctx = get_guild_ctx(guild_id, &ctx).await?;

    let redis = &ctx.data().core.redis;
    let db = &ctx.data().core.db;
    let cache = &ctx.data().core.guild_configs_cache;

    let settings = get_settings(db, redis, cache, guild_id).await?;

    let mut reply = CreateReply::default().ephemeral(true);
    let display_name = author_member.user.global_name.as_deref().unwrap_or(&author_member.user.name);

    match message_type {
        MemberMessageType::Public | MemberMessageType::Private => {
            let Some(welcome_cfg) = &settings.welcome else {
                ctx.send(reply.content("❌ Welcome settings are not configured!")).await?;
                return Ok(());
            };

            let is_dm = matches!(message_type, MemberMessageType::Private);
            let msg_settings = if is_dm {
                welcome_cfg.private.as_ref()
            } else {
                welcome_cfg.public.as_ref()
            };

            let Some(msg_settings) = msg_settings else {
                ctx.send(reply.content(format!("❌ {message_type:?} settings not found!"))).await?;
                return Ok(());
            };

            let warning_note = if msg_settings.enabled.unwrap_or(false) {
                ""
            } else {
                "*(Note: This welcome message is currently disabled in settings)*\n\n"
            };

            // Build welcome message layout
            let msg_builder = messages::build_welcome_message(
                msg_settings,
                &author_member,
                &channel,
                &gctx,
                warning_note,
                is_dm,
            )?;

            // Generate welcome SVG card if enabled
            if msg_settings.send_image
                && let Some(bytes) = generate_welcome_card(
                    display_name,
                    &author_member.user.face(),
                    gctx.member_count,
                    &gctx.name,
                    &msg_settings.image_style,
                ).await {
                    reply = reply.attachment(CreateAttachment::bytes(bytes, "welcome_preview.png"));
                }

            apply_message_to_reply(msg_builder, &mut reply);
        }

        MemberMessageType::Leave => {
            let Some(leave_cfg) = &settings.leave else {
                ctx.send(reply.content("❌ Leave settings are not configured!")).await?;
                return Ok(());
            };

            let msg_settings = &leave_cfg.message;

            // Build goodbye message layout
            let msg_builder = messages::build_goodbye_message(
                ctx.serenity_context(),
                guild_id,
                &author_member.user,
                Some(&author_member),
                leave_cfg,
            ).await;

            // Generate goodbye SVG card if enabled
            if msg_settings.send_image
                && let Some(bytes) = generate_leave_card(
                    display_name,
                    &author_member.user.face(),
                    gctx.member_count,
                    &gctx.name,
                    &msg_settings.image_style,
                ).await {
                    reply = reply.attachment(CreateAttachment::bytes(bytes, "leave_preview.png"));
                }

            apply_message_to_reply(msg_builder, &mut reply);
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