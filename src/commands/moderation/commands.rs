use crate::commands::helpers::dm::GuildMetadata;
use crate::commands::moderation::perms::pre_flight_check;
use crate::commands::moderation::utils;
use crate::commands::moderation::utils::{parse_duration, send_ephemeral};
use crate::types::types::{Context, Error};
use crate::utils::logger::{log_moderation_action, ActionType};
use crate::utils::moderating::{issue_ban, issue_kick, issue_mute, issue_softban, issue_unmute};
use poise::serenity_prelude as serenity;
use serenity::all::{GetMessages, Member, MessageId, User};
use std::time::{SystemTime, UNIX_EPOCH};

/// Kicks a user with an optional specified reason.
#[poise::command(slash_command, default_member_permissions = "KICK_MEMBERS", guild_only)]
pub async fn kick(
    ctx: Context<'_>,
    #[description = "The user to kick"] user: User,
    #[description = "The reason"] reason: Option<String>,
) -> Result<(), Error> {
    let Some(meta) = pre_flight_check(&ctx, user.id, "kick").await? else { return Ok(()); };
    let reason_str = reason.as_deref().unwrap_or("No reason provided");

    issue_kick(
        &ctx.data().db,
        &ctx.data().redis,
        &ctx.serenity_context().http,
        meta.id,
        ctx.channel_id(),
        user.clone(),
        ctx.author().clone(),
        reason_str,
    ).await?;

    send_ephemeral(&ctx, format!("{} is kicked for reason: \"{}\"", user.name, reason_str)).await?;

    log_moderation_action(
        &ctx, meta.id.get(), user.id.get(), meta.author_id.get(),
        ActionType::Kick, Some(reason_str), None,
    ).await?;

    Ok(())
}

/// Bans a user with an optional specified reason.
#[poise::command(slash_command, default_member_permissions = "BAN_MEMBERS", guild_only)]
pub async fn ban(
    ctx: Context<'_>,
    #[description = "The user to ban"] user: User,
    #[description = "Duration (e.g., 30m, 2h, 1d). Empty for permanent."] duration: Option<String>,
    #[description = "The reason"] reason: Option<String>,
    #[description = "Days of messages to delete (0-7)"]
    #[min = 0]
    #[max = 7]
    dmd: Option<u8>,
) -> Result<(), Error> {
    let Some(meta) = pre_flight_check(&ctx, user.id, "ban").await? else { return Ok(()); };

    let reason_str = reason.as_deref().unwrap_or("No reason provided");
    let dmd_time = dmd.unwrap_or(3);
    let duration_label = duration.as_deref().unwrap_or("Permanent");
    let redis_conn = &ctx.data().redis;

    // Parse the duration string into an Option<std::time::Duration>
    let parsed_duration = match &duration {
        Some(ds) => {
            let Some(dur) = parse_duration(&ctx, ds).await? else { return Ok(()); };
            Some(dur)
        }
        None => None,
    };

    issue_ban(
        &ctx.data().db,
        redis_conn,
        &ctx.serenity_context().http,
        meta.id,
        user.clone(),
        ctx.author().clone(),
        reason_str,
        dmd_time,
        parsed_duration,
        duration_label,
    ).await?;

    let conf_msg = format!(
        "**Successfully banned {}** {} (Reason: `{}`).",
        user.tag(),
        duration.as_ref().map_or("permanently".to_string(), |d| format!("for {}", d)),
        reason_str
    );
    send_ephemeral(&ctx, conf_msg).await?;

    log_moderation_action(
        &ctx,
        meta.id.get(),
        user.id.get(),
        meta.author_id.get(),
        ActionType::Ban,
        Some(reason_str),
        duration.as_deref(),
    ).await?;

    Ok(())
}

/// Bulk deletes messages. Messages mustn't be older than 14 days.
#[poise::command(
    slash_command,
    default_member_permissions = "MANAGE_MESSAGES",
    guild_only
)]
pub async fn purge(
    ctx: Context<'_>,

    #[description = "Amount of messages to purge"]
    #[min = 1]
    #[max = 100]
    amount: u8,
) -> Result<(), Error> {
    ctx.defer_ephemeral().await?;

    let channel_id = ctx.channel_id();

    let builder = GetMessages::new().limit(amount);
    let messages = channel_id
        .messages(&ctx.serenity_context().http, builder)
        .await?;

    let message_ids: Vec<MessageId> = utils::get_to_be_deleted_message_ids(&messages);

    if !message_ids.is_empty() {
        channel_id
            .delete_messages(&ctx.serenity_context().http, &message_ids)
            .await?;
        send_ephemeral(&ctx, format!("Deleted {} message(s).", message_ids.len())).await?;
    } else {
        send_ephemeral(&ctx, "Seems like I can't delete any messages. Perhaps those messages are older than 14 days?").await?;
    }
    Ok(())
}


/// Mutes someone through Discord's timeout.
#[poise::command(
    slash_command,
    default_member_permissions = "MODERATE_MEMBERS",
    guild_only
)]
pub async fn mute(
    ctx: Context<'_>,
    #[description = "The user to mute"] member: Member,
    #[description = "Duration (e.g., 30m, 2h, 1d). Range is 60s to 28 days."] duration: String,
    #[description = "The reason."] reason: Option<String>,
) -> Result<(), Error> {
    let Some(meta) = pre_flight_check(&ctx, member.user.id, "mute").await? else { return Ok(()); };
    let reason_str = reason.as_deref().unwrap_or("No reason specified");

    let Some(dur) = parse_duration(&ctx, &duration).await? else { return Ok(()); };

    if dur > std::time::Duration::from_secs(28 * 24 * 60 * 60) || dur < std::time::Duration::from_secs(60) {
        send_ephemeral(&ctx, "Discord timeouts cannot exceed 28 days or fall short of 60 seconds.").await?;
        return Ok(());
    }

    let future_unix = (SystemTime::now() + dur).duration_since(UNIX_EPOCH)?.as_secs() as i64;
    let timestamp = serenity::all::Timestamp::from_unix_timestamp(future_unix)?;

    issue_mute(
        &ctx.data().db,
        &ctx.data().redis,
        &ctx.serenity_context().http,
        meta.id,
        member.user.clone(),
        ctx.author().clone(),
        reason_str,
        &dur,
        timestamp,
    ).await?;

    send_ephemeral(
        &ctx,
        format!("**{}** has been muted for {} (Reason: `{}`)", member.user.name, &duration, reason_str),
    ).await?;

    log_moderation_action(
        &ctx, meta.id.get(), member.user.id.get(), meta.author_id.get(),
        ActionType::Mute, Some(reason_str), Some(&duration),
    ).await?;

    Ok(())
}

/// Unmutes someone from a timeout.
#[poise::command(
    slash_command,
    default_member_permissions = "MODERATE_MEMBERS",
    guild_only
)]
pub async fn unmute(
    ctx: Context<'_>,
    #[description = "The member to unmute"] member: Member,
) -> Result<(), Error> {
    let Some(meta) = pre_flight_check(&ctx, member.user.id, "unmute").await? else { return Ok(()); };

    if member.communication_disabled_until.is_none() {
        send_ephemeral(
            &ctx,
            format!(
                "You cannot unmute **{}** as that member is not muted in the first place.",
                member.user.name
            ),
        ).await?;
        return Ok(());
    }

    let redis_conn = &ctx.data().redis;

    issue_unmute(
        &ctx.data().db,
        redis_conn,
        &ctx.serenity_context().http,
        meta.id,
        member.user.clone(),
        ctx.author().clone(),
    ).await?;

    send_ephemeral(&ctx, format!("**Successfully unmuted {}**.", member.user.name)).await?;

    log_moderation_action(
        &ctx,
        meta.id.get(),
        member.user.id.get(),
        meta.author_id.get(),
        ActionType::Unmute,
        None,
        None,
    ).await?;

    Ok(())
}

/// Bans then immediately unbans to purge any messages from the specified user.
#[poise::command(slash_command, default_member_permissions = "BAN_MEMBERS", guild_only)]
pub async fn softban(
    ctx: Context<'_>,
    #[description = "The member to softban"] member: Member,
    #[description = "The reason"] reason: Option<String>,
    #[description = "The number of day's worth of messages to delete"]
    #[min = 0]
    #[max = 7]
    dmd: u8,
) -> Result<(), Error> {
    let Some(meta) = pre_flight_check(&ctx, member.user.id, "softban").await? else { return Ok(()); };
    let reason_str = reason.as_deref().unwrap_or("No reason specified");

    let redis_conn = &ctx.data().redis;

    issue_softban(
        &ctx.data().db,
        redis_conn,
        &ctx.serenity_context().http,
        meta.id,
        member.user.clone(),
        ctx.author().clone(),
        reason_str,
        dmd,
    ).await?;

    // 3. Ephemeral confirmation & Logging
    send_ephemeral(
        &ctx,
        format!("**Successfully soft-banned {}**", member.user.name),
    ).await?;

    log_moderation_action(
        &ctx,
        meta.id.get(),
        member.user.id.get(),
        meta.author_id.get(),
        ActionType::Softban,
        Some(reason_str),
        None,
    ).await?;

    Ok(())
}

/// Unbans a previously banned user
#[poise::command(slash_command, default_member_permissions = "BAN_MEMBERS", guild_only)]
pub async fn unban(
    ctx: Context<'_>,

    #[description = "The user to unban (ID or mention)"] user: User,

    #[description = "The reason for the unban"] reason: Option<String>,
) -> Result<(), Error> {
    let meta = GuildMetadata::extract(&ctx)?;
    let reason_str = reason.unwrap_or_else(|| "No reason specified".to_string());
    let unban_result = meta.id.unban(ctx.http(), user.id).await;

    match unban_result {
        Ok(_) => {
            log_moderation_action(
                &ctx,
                meta.id.get(),
                user.id.get(),
                meta.author_id.get(),
                ActionType::Unban,
                Some(&reason_str),
                None,
            )
                .await?;

            ctx.say(format!(
                "Successfully unbanned **{}** (ID: `{}`).",
                user.tag(),
                user.id
            ))
                .await?;
        }
        Err(err) => {
            ctx.say(format!("Failed to unban user: {}", err)).await?;
        }
    }

    Ok(())
}
