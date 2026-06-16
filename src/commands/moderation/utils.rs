use crate::types::{Context, Error};
use serenity::all::{Member, Message, MessageId, PartialGuild, UserId};

/// Calculates the highest role position of a member.
/// Falls back to 0 (the default position of the @everyone role) if no other roles exist.
pub fn get_highest_role_pos(member: &Member, guild: &PartialGuild) -> i16 {
    member
        .roles
        .iter()
        .filter_map(|role_id| guild.roles.get(role_id))
        .map(|role| role.position)
        .max()
        .unwrap_or(0) as i16
}

/// A pure business logic function to validate hierarchy positions.
/// This can be easily unit-tested with dummy values.
pub fn validate_hierarchy(
    executor_id: UserId,
    owner_id: UserId,
    executor_pos: i16,
    target_pos: i16,
    bot_pos: i16,
) -> Result<(), &'static str> {
    // If the executor is the server owner, they bypass executor hierarchy checks.
    if executor_id == owner_id {
        if bot_pos <= target_pos {
            return Err("I cannot moderate this user because their highest role is equal to or higher than mine.");
        }
        return Ok(());
    }

    // Normal executor hierarchy check
    if executor_pos <= target_pos {
        return Err("You cannot moderate this user because their highest role is equal to or higher than yours.");
    }

    // Bot hierarchy check
    if bot_pos <= target_pos {
        return Err("I cannot moderate this user because their highest role is equal to or higher than mine.");
    }

    Ok(())
}

/// Parses duration and yells at the user if they format it like a toddler.
pub async fn parse_duration(
    ctx: &Context<'_>,
    duration: &str,
) -> Result<Option<std::time::Duration>, Error> {
    match duration_str::parse_std(duration) {
        Ok(dur) => Ok(Some(dur)),
        Err(_) => {
            send_ephemeral(
                ctx,
                "Invalid duration format. Please use formats like '30m', '2h', or '1d'.",
            )
                .await?;
            Ok(None) // Returning Ok(None) lets the command exit gracefully
        }
    }
}

/// Sends a simple ephemeral reply back to the user.
pub async fn send_ephemeral(ctx: &Context<'_>, message: impl Into<String>) -> Result<(), Error> {
    ctx.send(
        poise::CreateReply::default()
            .content(message)
            .ephemeral(true),
    )
        .await?;
    Ok(())
}

pub fn get_to_be_deleted_message_ids(messages: &Vec<Message>) -> Vec<MessageId> {
    let now = serenity::model::Timestamp::now();

    messages
        .iter()
        .filter(|m| {
            let age = now.unix_timestamp() - m.timestamp.unix_timestamp();
            age < (14 * 24 * 60 * 60) - 60
        })
        .map(|m| m.id)
        .collect()
}