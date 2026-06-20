use crate::core::config::{get_guild_ctx, get_settings};
use crate::events::handlers::join_leave::{database, utils};
use crate::types::config::welcome::WelcomeConfig;
use crate::types::{Data, Error};
use crate::utils::custom_msg::build_custom_message;
use crate::utils::placeholders::replace_welcome_goodbye_placeholders;
use poise::serenity_prelude as serenity;
use serenity::all::{EditMember, RoleId};
use serenity::{ChannelId, CreateEmbed, CreateMessage};
use std::collections::HashSet;

pub async fn on_member_join(
    ctx: &serenity::Context,
    member: &serenity::all::Member,
    data: &Data,
) -> Result<(), Error> {
    let guild_id = member.guild_id.get() as i64;
    let settings = get_settings(&data.db, &data.redis, guild_id).await?;

    if let Some(welcome_config) = settings.welcome {
        if let Err(e) = handle_member_welcome(ctx, member, welcome_config).await {
            eprintln!("Error processing welcome routine for {}: {:?}", member.user.name, e);
        }
    }

    let user_id = member.user.id.get() as i64;
    database::log_join_to_db(user_id, guild_id, &data).await?;

    Ok(())
}

pub async fn on_member_leave(
    ctx: &serenity::Context,
    _guild_id: &serenity::GuildId,
    user: &serenity::User,
    member_data_if_available: &Option<serenity::Member>,
    data: &Data,
) -> Result<(), Error> {
    let guild_id = _guild_id.get() as i64;
    let settings = get_settings(&data.db, &data.redis, guild_id).await?;

    let Some(leave_cfg) = settings.leave.as_ref().filter(|cfg| cfg.enabled.unwrap_or(false)) else {
        return database::log_leave_to_db(user.id.get() as i64, guild_id, &data.db).await;
    };

    let Some(channel_id) = leave_cfg.channel_id.as_ref().and_then(|id| id.parse::<u64>().ok().map(ChannelId::new)) else {
        return database::log_leave_to_db(user.id.get() as i64, guild_id, &data.db).await;
    };

    let msg_payload = match member_data_if_available {
        Some(member) => {
            let gctx_res = get_guild_ctx(_guild_id.clone(), ctx).await;
            let context_ch_res = utils::get_context_channel(ctx, member, leave_cfg.channel_id.as_deref()).await;

            match (gctx_res, context_ch_res) {
                (Ok(gctx), Ok(context_channel)) => {
                    let is_embed = leave_cfg.format.as_deref().unwrap_or("embed") == "embed";

                    let custom = build_custom_message(
                        is_embed,
                        leave_cfg.content.as_ref(),
                        leave_cfg.embed.as_ref(),
                        |text| replace_welcome_goodbye_placeholders(text, &gctx, member, &context_channel, None, None),
                    ).unwrap_or_else(|e| {
                        eprintln!("Failed to build custom leave message: {}", e);
                        None
                    });

                    Some(custom.unwrap_or_else(|| build_fallback_message(user, member_data_if_available)))
                }
                _ => {
                    None
                }
            }
        }
        None => {
            Some(build_fallback_message(user, &None))
        }
    };

    if let Some(builder) = msg_payload {
        let _ = channel_id.send_message(&ctx.http, builder).await;
    }

    database::log_leave_to_db(user.id.get() as i64, guild_id, &data.db).await?;
    Ok(())
}

async fn handle_member_welcome(
    ctx: &serenity::Context,
    member: &serenity::all::Member,
    config: WelcomeConfig, // Adjust type as necessary
) -> Result<(), Error> {
    let warning_text = utils::check_alt_status(&member.user);

    let gctx = get_guild_ctx(member.guild_id, ctx).await?;

    let public_channel_id_str = config.public.as_ref().and_then(|p| p.channel_id.as_deref());
    let context_channel = utils::get_context_channel(ctx, member, public_channel_id_str).await?;

    if let Some(role_ids) = config.join_role_ids {
        let mut role_set: HashSet<RoleId> = member.roles.iter().copied().collect();
        for role_id in role_ids {
            role_set.insert(RoleId::from(role_id.parse::<u64>()?));
        }
        let merged_roles: Vec<RoleId> = role_set.into_iter().collect();
        let builder = EditMember::new().roles(merged_roles);
        member.guild_id.edit_member(ctx, member.user.id, builder).await?;
    }

    if let Some(public) = config.public.filter(|p| p.enabled.unwrap_or(false)) {
        if let Some(ch_str) = public.channel_id.as_ref().and_then(|id| id.parse::<u64>().ok()) {
            let channel_id = ChannelId::new(ch_str);
            if let Ok(builder) = utils::build_welcome_message(&public, member, &context_channel, &gctx, &warning_text, false) {
                let _ = channel_id.send_message(&ctx.http, builder).await;
            }
        }
    }

    if let Some(private) = config.private.filter(|p| p.enabled.unwrap_or(false)) {
        if let Ok(dm_channel) = member.user.create_dm_channel(&ctx.http).await {
            if let Ok(builder) = utils::build_welcome_message(&private, member, &context_channel, &gctx, &warning_text, true) {
                let _ = dm_channel.send_message(&ctx.http, builder).await;
            }
        }
    }

    Ok(())
}


/// Helper function to build fallback message
fn build_fallback_message(user: &serenity::User, member: &Option<serenity::Member>) -> CreateMessage {
    let roles_text = utils::format_member_roles(member);
    let embed = CreateEmbed::new()
        .title("Member Left / Kicked")
        .description(format!("**{}** (`{}`) is no longer in the server.", user.name, user.id))
        .field("Roles before leaving", roles_text, false)
        .thumbnail(user.face())
        .color(serenity::Color::from_rgb(255, 0, 0))
        .timestamp(serenity::Timestamp::now());

    CreateMessage::new().embed(embed)
}

