use std::time::{SystemTime, UNIX_EPOCH};

use poise::serenity_prelude as serenity;
use serenity::{
    builder::GetMessages,
    model::{guild::Member, id::MessageId, user::User},
};

use crate::commands::helpers::permissions::check_hierarchy;
use crate::types::{Context, Error};
use crate::{
    commands::helpers::dm::{
        GuildMetadata, check_self_moderation, send_ephemeral, try_dm_moderation_action,
    },
    utils::logger::{ActionType, log_moderation_action},
};

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
    let now = serenity::model::Timestamp::now();

    let builder = GetMessages::new().limit(amount);
    let _messages = channel_id
        .messages(&ctx.serenity_context().http, builder)
        .await?;

    let message_ids: Vec<MessageId> = _messages
        .iter()
        .filter(|m| {
            let age = now.unix_timestamp() - m.timestamp.unix_timestamp();
            age < (14 * 24 * 60 * 60) - 60 // 14 days minus a 60s buffer
        })
        .map(|m| m.id)
        .collect();

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

/// Kicks a user with an optional specified reason.
#[poise::command(slash_command, default_member_permissions = "KICK_MEMBERS", guild_only)]
pub async fn kick(
    ctx: Context<'_>,

    #[description = "The user to kick"] user: User,

    #[description = "The reason"] reason: Option<String>,
) -> Result<(), Error> {
    if check_self_moderation(&ctx, user.id, "kick").await? {
        return Ok(());
    }

    if let Err(err_msg) = check_hierarchy(ctx, user.id).await {
        ctx.say(format!("❌ Action Denied: {}", err_msg)).await?;
        return Ok(());
    }

    let meta = GuildMetadata::extract(&ctx)?;
    let reason_str = reason.as_deref().unwrap_or("No reason provided");

    try_dm_moderation_action(
        &ctx,
        &user,
        format!("You have been kicked from {}", meta.name),
        0xff8a42,
        reason_str,
        &[],
    )
    .await;

    meta.id
        .kick_with_reason(&ctx.serenity_context().http, user.id, reason_str)
        .await?;

    send_ephemeral(
        &ctx,
        format!("{} is kicked for reason: \"{}\"", user.name, reason_str),
    )
    .await?;

    log_moderation_action(
        &ctx,
        meta.id.get(),
        user.id.get(),
        meta.author_id.get(),
        ActionType::Kick,
        Some(reason_str),
        None,
    )
    .await?;

    Ok(())
}

/// Bans a user with an optional specified reason.
#[poise::command(slash_command, default_member_permissions = "BAN_MEMBERS", guild_only)]
pub async fn ban(
    ctx: Context<'_>,

    #[description = "The user to ban"] user: User,

    #[description = "The duration in string (e.g., 30m, 2h, 1d). Leave empty for permanent."]
    duration: Option<String>,

    #[description = "The reason"] reason: Option<String>,

    #[description = "The number of day's worth of messages to delete"]
    #[min = 0]
    #[max = 7]
    dmd: Option<u8>,
) -> Result<(), Error> {
    if check_self_moderation(&ctx, user.id, "ban").await? {
        return Ok(());
    }

    if let Err(err_msg) = check_hierarchy(ctx, user.id).await {
        ctx.say(format!("❌ Action Denied: {}", err_msg)).await?;
        return Ok(());
    }

    let meta = GuildMetadata::extract(&ctx)?;
    let reason_str = reason.as_deref().unwrap_or("No reason provided");
    let dmd_time = dmd.unwrap_or(3);

    if dmd_time > 7 {
        send_ephemeral(&ctx, "You can only set dmd between 0 and 7!").await?;
        return Ok(());
    }

    let duration_parsed = match &duration {
        Some(ds) => match duration_str::parse_std(ds) {
            Ok(dur) => Some(dur),
            Err(_) => {
                send_ephemeral(
                    &ctx,
                    "Invalid duration format. Please use formats like '30m', '2h', or '1d'.",
                )
                .await?;
                return Ok(());
            }
        },
        None => None,
    };

    let duration_label = duration.as_deref().unwrap_or("Permanent");
    try_dm_moderation_action(
        &ctx,
        &user,
        format!("You have been banned from {}", meta.name),
        0xFF4747,
        reason_str,
        &[("Duration", duration_label)],
    )
    .await;

    meta.id
        .ban_with_reason(&ctx.serenity_context().http, user.id, dmd_time, reason_str)
        .await?;

    let confirmation_msg = if let Some(ref ds) = duration {
        format!(
            "Successfully banned {} for {} (Reason: {}).",
            user.tag(),
            ds,
            reason_str
        )
    } else {
        format!(
            "Successfully banned {} permanently (Reason: {}).",
            user.tag(),
            reason_str
        )
    };
    send_ephemeral(&ctx, confirmation_msg).await?;

    log_moderation_action(
        &ctx,
        meta.id.get(),
        user.id.get(),
        meta.author_id.get(),
        ActionType::Ban,
        Some(reason_str),
        duration.as_deref(),
    )
    .await?;

    if let Some(dur) = duration_parsed {
        let db = &ctx.data().db;
        let now = chrono::Utc::now();
        let time_duration =
            chrono::Duration::from_std(dur).map_err(|_| "Duration calculation overflowed")?;
        let unban_at = now + time_duration;

        sqlx::query!(
            "INSERT INTO temp_bans (guild_id, user_id, unban_at) VALUES ($1, $2, $3)",
            meta.id.get() as i64,
            user.id.get() as i64,
            unban_at
        )
        .execute(db)
        .await?;
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

    #[description = "The user to mute"] mut member: Member,

    #[description = "The duration in string (e.g., 30m, 2h, 1d). Range is 60 seconds up to 28 days."]
    duration: String,

    #[description = "The reason."] reason: Option<String>,
) -> Result<(), Error> {
    if check_self_moderation(&ctx, member.user.id, "mute").await? {
        return Ok(());
    }

    if let Err(err_msg) = check_hierarchy(ctx, member.user.id).await {
        ctx.say(format!("❌ Action Denied: {}", err_msg)).await?;
        return Ok(());
    }

    let meta = GuildMetadata::extract(&ctx)?;
    let reason_str = reason.as_deref().unwrap_or("No reason specified");

    let dur = match duration_str::parse_std(&duration) {
        Ok(dur) => dur,
        Err(_) => {
            send_ephemeral(
                &ctx,
                "Invalid duration format. Please use formats like '30m', '2h', or '1d'.",
            )
            .await?;
            return Ok(());
        }
    };

    let max_timeout = std::time::Duration::from_secs(28 * 24 * 60 * 60);
    let min_timeout = std::time::Duration::from_secs(60);

    if dur > max_timeout || dur < min_timeout {
        send_ephemeral(
            &ctx,
            "Discord timeouts cannot exceed 28 days or short of 60 seconds.",
        )
        .await?;
        return Ok(());
    }

    let current_time = SystemTime::now();
    let future_time = current_time + dur;
    let future_unix = future_time.duration_since(UNIX_EPOCH)?.as_secs() as i64;
    let timestamp = serenity::Timestamp::from_unix_timestamp(future_unix)?;

    try_dm_moderation_action(
        &ctx,
        &member.user,
        format!("You have been muted from {}", meta.name),
        0xFFC54F,
        reason_str,
        &[("Duration", &duration)],
    )
    .await;

    member
        .disable_communication_until_datetime(&ctx.serenity_context().http, timestamp)
        .await?;

    send_ephemeral(
        &ctx,
        format!(
            "You have muted {} for {} (Reason: {})",
            member.user.name, &duration, reason_str
        ),
    )
    .await?;

    log_moderation_action(
        &ctx,
        meta.id.get(),
        member.user.id.get(),
        meta.author_id.get(),
        ActionType::Mute,
        Some(reason_str),
        Some(&duration),
    )
    .await?;
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

    #[description = "The member to unmute"] mut member: Member,
) -> Result<(), Error> {
    if check_self_moderation(&ctx, member.user.id, "unmute").await? {
        return Ok(());
    }

    if let Err(err_msg) = check_hierarchy(ctx, member.user.id).await {
        ctx.say(format!("❌ Action Denied: {}", err_msg)).await?;
        return Ok(());
    }

    let meta = GuildMetadata::extract(&ctx)?;

    if member.communication_disabled_until.is_none() {
        send_ephemeral(
            &ctx,
            format!(
                "You cannot unmute {} as that member is not muted in the first place.",
                member.user.name
            ),
        )
        .await?;
        return Ok(());
    }

    member
        .enable_communication(&ctx.serenity_context().http)
        .await?;

    try_dm_moderation_action(
        &ctx,
        &member.user,
        format!("You have been unmuted from {}!", meta.name),
        0xFFC54F,
        "No reason specified",
        &[],
    )
    .await;

    send_ephemeral(&ctx, format!("Successfully unmuted {}.", member.user.name)).await?;

    log_moderation_action(
        &ctx,
        meta.id.get(),
        member.user.id.get(),
        meta.author_id.get(),
        ActionType::Unmute,
        None,
        None,
    )
    .await?;
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
    if check_self_moderation(&ctx, member.user.id, "softban").await? {
        return Ok(());
    }

    if let Err(err_msg) = check_hierarchy(ctx, member.user.id).await {
        ctx.say(format!("❌ Action Denied: {}", err_msg)).await?;
        return Ok(());
    }

    let meta = GuildMetadata::extract(&ctx)?;
    let reason_str = reason.as_deref().unwrap_or("No reason specified");

    if dmd > 7 {
        send_ephemeral(&ctx, "You can only set dmd between 0 and 7 inclusive!").await?;
        return Ok(());
    }

    try_dm_moderation_action(
        &ctx,
        &member.user,
        format!("You have been soft-banned from {}", meta.name),
        0xFF4747,
        reason_str,
        &[(
            "Notice",
            "You have been banned and immediately unbanned to purge your messages.",
        )],
    )
    .await;

    member.ban(&ctx.serenity_context().http, dmd).await?;
    member.unban(&ctx.serenity_context().http).await?;

    send_ephemeral(
        &ctx,
        format!("Successfully softbanned {}", member.user.name),
    )
    .await?;

    log_moderation_action(
        &ctx,
        meta.id.get(),
        member.user.id.get(),
        meta.author_id.get(),
        ActionType::Softban,
        Some(reason_str),
        None,
    )
    .await?;
    Ok(())
}

#[poise::command(slash_command, default_member_permissions = "BAN_MEMBERS", guild_only)]
pub async fn unban(
    ctx: Context<'_>,

    #[description = "The user to unban (ID or mention)"] user: User,

    #[description = "The reason for the unban"] reason: Option<String>,
) -> Result<(), Error> {
    let meta = GuildMetadata::extract(&ctx)?;
    let reason_str = reason.unwrap_or_else(|| "No reason specified".to_string());
    let unban_result = meta.id.unban(ctx.http(), user.id).await;

    try_dm_moderation_action(
        &ctx,
        &user,
        format!("You have been unbanned from {}", meta.name),
        0xFF4747,
        &reason_str,
        &[],
    )
    .await;

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
