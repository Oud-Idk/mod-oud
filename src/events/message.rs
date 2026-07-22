use crate::core::config::{get_guild_ctx, get_settings};
use crate::events::handlers::levels::text;
use crate::events::handlers::message_filter::actions::log_automod_event;
use crate::events::handlers::message_filter::database::insert_automod_log;
use crate::events::handlers::message_logging::cache::cache_message_in_redis;
use crate::events::handlers::message_logging::handlers::{message_log_delete, message_log_update};
use crate::events::handlers::reaction_roles::{handle_reaction_role_add, handle_reaction_role_remove};
use crate::events::handlers::starboard::starboard::{handle_starboard_reaction_add, handle_starboard_reaction_remove};
use crate::events::handlers::{message_filter, starboard, tickets};
use crate::send_mod_dm;
use crate::types::config::config::GuildSettings;
use crate::types::{Data, Error};
use crate::utils::custom_msg::build_custom_message;
use crate::utils::moderation::issuing::{issue_ban, schedule_unban};
use crate::utils::moderation::MODERATION_FOOTER;
use crate::utils::placeholders::replace_user_placeholders;
use crate::utils::store_username_relation;
use serenity::all::{ChannelId, Context, CreateEmbed, CreateEmbedFooter, CreateMessage, GuildId, Message, MessageId, MessageUpdateEvent, Reaction, Role, RoleId};
use std::collections::HashSet;
use std::num::ParseIntError;
use std::time::Duration;
use tracing::warn;

pub async fn on_message(ctx: &Context, message: &Message, data: &Data) -> Result<(), Error> {
    if message.author.bot {
        return Ok(());
    }

    store_username_relation(&data.db, &data.redis, message.author.id.get(), &message.author.name).await?;

    let Some(guild_id) = message.guild_id else {
        return Ok(());
    };

    let guild_id_i64 = guild_id.get() as i64;
    let config = get_settings(&data.db, &data.redis, &data.guild_configs, guild_id_i64).await?;

    // Check Honeypot
    if handle_honeypot(ctx, message, data, guild_id, &config).await? {
        return Ok(());
    }

    // Cache Message for Logging
    if config.message_logging.as_ref().and_then(|v| v.enabled).unwrap_or(false) {
        let redis_conn = data.redis.clone();
        let msg_clone = message.clone();
        tokio::spawn(async move {
            if let Err(e) = cache_message_in_redis(&redis_conn, &msg_clone).await {
                tracing::error!("Failed to cache message in Redis: {}", e);
            }
        });
    }

    // Message Filters
    if message_filter::handle_filtering(ctx, data, &config, message).await? {
        return Ok(());
    }

    // Tickets & Leveling
    tickets::handle_tickets(ctx, message, data, &config).await?;
    text::handle_leveling(ctx, message, data, config.leveling).await?;

    Ok(())
}

/// Handles honeypot detection and banishing. Returns `Ok(true)` if a user was caught and banished.
async fn handle_honeypot(
    ctx: &Context,
    message: &Message,
    data: &Data,
    guild_id: GuildId,
    config: &GuildSettings,
) -> Result<bool, Error> {
    let Some(honeypot) = config.honeypot.as_ref() else {
        return Ok(false);
    };

    // Fast exit if this channel is NOT the honeypot channel
    let is_honeypot_channel = honeypot.channel_id
        .as_ref()
        .and_then(|id_str| id_str.parse::<u64>().ok())
        .map(|id| id == message.channel_id.get())
        .unwrap_or(false);

    if !is_honeypot_channel {
        return Ok(false);
    }

    if let Some(member) = &message.member {
        if let Some(exempt_roles) = &honeypot.exempt_roles {
            let is_exempt = member.roles.iter().any(|user_role| {
                exempt_roles.iter().any(|role_str| {
                    role_str.parse::<u64>().ok() == Some(user_role.get())
                })
            });

            if is_exempt {
                return Ok(false);
            }
        }
    }

    let dmd = honeypot.dmd.unwrap_or(0);
    let reason = honeypot.reason
        .as_deref()
        .filter(|r| !r.trim().is_empty())
        .unwrap_or("Sending a message in a honeypot channel");

    let duration = honeypot.duration.map(Duration::from_millis);
    let honeypot_dm_settings = config.moderation_dms.as_ref().and_then(|m| m.honeypot.as_ref());
    let gctx = get_guild_ctx(guild_id, ctx).await?;

    insert_automod_log(
        &data.db,
        guild_id.get() as i64,
        message.author.id.get() as i64,
        None, None, "Honeypot", None,
        Some(&message.content), &["ban"], ""
    ).await?;

    send_mod_dm!(
        &ctx.http,
        &message.author,
        honeypot_dm_settings,
        "honeypot",
        |text| replace_user_placeholders(text, &gctx, &message.author),
        CreateEmbed::new()
            .title(format!("You have been banned from {}", gctx.name))
            .color(0xFF4747)
            .field("Reason", reason, false)
            .thumbnail(&gctx.icon_url)
            .footer(CreateEmbedFooter::new(MODERATION_FOOTER))
    );

    guild_id.ban_with_reason(&ctx, &message.author, dmd, reason).await?;

    if let Some(dur) = duration {
        schedule_unban(&data.db, guild_id, &message.author, dur).await?;
    }

    Ok(true)
}


pub async fn on_message_delete(
    ctx: &Context,
    channel_id: &ChannelId,
    deleted_message_id: &MessageId,
    guild_id: &Option<GuildId>,
    data: &Data,
) -> Result<(), Error> {
    starboard::handle_cleanup_if_starboard(&ctx, &data.db, deleted_message_id).await?;
    message_log_delete(ctx, channel_id, deleted_message_id, guild_id, data).await?;
    Ok(())
}

pub async fn on_message_update(
    ctx: &Context,
    old_if_available: Option<&Message>,
    new: Option<&Message>,
    event: &MessageUpdateEvent,
    data: &Data,
) -> Result<(), Error> {
    if let Some(message) = old_if_available {
        store_username_relation(&data.db, &data.redis, message.author.id.get(), &message.author.name).await?;
    }

    message_log_update(ctx, old_if_available, new, event, data).await?;

    Ok(())
}

pub async fn on_reaction_add(ctx: &Context, add_reaction: &Reaction, data: &Data) -> Result<(), Error> {
    handle_starboard_reaction_add(ctx, add_reaction, data).await?;
    handle_reaction_role_add(ctx, add_reaction, data).await?;
    Ok(())
}

pub async fn on_reaction_remove(ctx: &Context, removed_reaction: &Reaction, data: &Data) -> Result<(), Error> {
    handle_starboard_reaction_remove(ctx, removed_reaction, data).await?;
    handle_reaction_role_remove(ctx, removed_reaction, data).await?;
    Ok(())
}