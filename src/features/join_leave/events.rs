use crate::core::config::guild_ctx::get_guild_ctx;
use crate::core::config::settings::get_settings;
use crate::core::config::state::{BotData, Error};
use crate::features::join_leave::{log_join_to_db, messages, send};
use anyhow::Result;
use serenity::all::{Context, EditMember, Member, RoleId, User};
use std::collections::HashSet;
use tracing::{debug, trace, warn};

async fn apply_join_roles(ctx: &Context, member: &Member, role_ids: &[String]) -> Result<()> {
    let guild_id = member.guild_id.get();
    let user_id = member.user.id.get();
    let mut role_set: HashSet<RoleId> = member.roles.iter().copied().collect();
    for role_id in role_ids {
        role_set.insert(RoleId::from(role_id.parse::<u64>()?));
    }

    let merged_roles: Vec<RoleId> = role_set.into_iter().collect();
    let builder = EditMember::new().roles(merged_roles);

    if let Err(e) = member
        .guild_id
        .edit_member(ctx, member.user.id, builder)
        .await
    {
        warn!(error = ?e, guild_id, user_id, "automatic join roles not applied to the member");
    } else {
        debug!(guild_id, user_id, "assigned automatic join roles to member");
    }
    Ok(())
}

pub async fn handle_member_welcome(ctx: &Context, member: &Member, data: &BotData) -> Result<()> {
    let guild_id = member.guild_id;
    let user_id = member.user.id;
    let settings = get_settings(
        &data.core.db,
        &data.core.redis,
        &data.core.guild_configs_cache,
        guild_id,
    )
    .await?;
    let Some(config) = settings.welcome else {
        return Ok(());
    };

    let warning_text = check_alt_status(&member.user);
    let gctx = get_guild_ctx(member.guild_id, ctx).await?;

    let public_channel_id = config.public.as_ref().and_then(|p| p.channel_id);
    let context_channel = messages::get_context_channel(ctx, member, public_channel_id).await?;

    if let Some(ref role_ids) = config.join_role_ids
        && let Err(e) = apply_join_roles(ctx, member, role_ids).await
    {
        warn!(
            error = ?e,
            %guild_id,
            %user_id,
            "automatic join roles not applied; a configured role id did not parse"
        );
    }

    send::send_public_welcome(ctx, member, &config, &context_channel, &gctx, &warning_text).await?;
    send::send_private_welcome(ctx, member, &config, &context_channel, &gctx, &warning_text)
        .await?;

    Ok(())
}

pub fn check_alt_status(user: &User) -> String {
    let user_id = user.id.get();
    let created_timestamp = user.id.created_at().unix_timestamp();
    let now_timestamp = serenity::all::Timestamp::now().unix_timestamp();
    let age_in_days = (now_timestamp - created_timestamp) / 86400;

    if age_in_days < 3 {
        debug!(
            user_id,
            age_in_days, "new account detected; alt warning added to the welcome message"
        );
        format!("\n\n⚠️ **WARNING:** This account is very new! Created {age_in_days} days ago.")
    } else {
        trace!(user_id, age_in_days, "account age is normal");
        String::new()
    }
}

/// Fanout events for member join handling.
///
/// # Errors
/// Propagates errors from `handle_member_welcome` or `log_join_to_db`.
pub async fn handle_member_join(
    ctx: &Context,
    member: &Member,
    data: &BotData,
) -> Result<(), Error> {
    handle_member_welcome(ctx, member, data).await?;
    log_join_to_db(member.user.id, member.guild_id, data).await?;
    Ok(())
}
