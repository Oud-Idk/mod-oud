use crate::types::config::starboard::{RestrictionType, Starboard};
use crate::types::Error;
use chrono::Utc;
use redis::aio::MultiplexedConnection;
use redis::AsyncCommands;
use serenity::all::{ChannelId, Member, Message, Reaction, RoleId, UserId};

pub async fn is_event_allowed(
    starboard: &Starboard,
    reaction: &Reaction,
    message: &Message,
    member: &Member,
    user_id: UserId,
    redis: &mut MultiplexedConnection,
) -> Result<bool, Error> {
    if !is_channel_allowed(starboard, reaction) {
        return Ok(false);
    }

    if starboard.prevent_self_star.unwrap_or(false) && user_id == message.author.id {
        return Ok(false);
    }

    if !starboard.allow_bot_messages.unwrap_or(true) && message.author.bot {
        return Ok(false);
    }

    if !is_message_age_allowed(starboard, message.timestamp.timestamp_millis()) {
        return Ok(false);
    }

    let guild_id_str = reaction.guild_id.unwrap_or_default().to_string();
    let allowed_cache_key = format!("starboard:allowed:{}:{}:{}", guild_id_str, starboard.id, user_id);
    let maybe_user_allowed: Option<bool> = redis.get(&allowed_cache_key).await?;

    let user_allowed = match maybe_user_allowed {
        Some(allowed) => allowed,
        None => {
            let allowed = is_role_allowed(starboard, member);
            let _: () = redis.set_ex(&allowed_cache_key, allowed, 3600).await?;
            allowed
        }
    };

    Ok(user_allowed)
}

fn is_role_allowed(starboard: &Starboard, member: &Member) -> bool {
    let restriction_type = starboard.role_restriction_type.unwrap_or(RestrictionType::None);
    if restriction_type == RestrictionType::None {
        return true;
    }

    let Some(restricted_roles) = &starboard.restricted_roles else {
        return matches!(restriction_type, RestrictionType::AllExcept);
    };

    let roles = restricted_roles
        .iter()
        .map(|id| RoleId::from(*id as u64))
        .collect::<Vec<RoleId>>();

    match restriction_type {
        RestrictionType::AllExcept => !member_has_any_role(member, &roles),
        RestrictionType::OnlyThese => member_has_any_role(member, &roles),
        RestrictionType::None => true,
    }
}

fn is_channel_allowed(starboard: &Starboard, reaction: &Reaction) -> bool {
    let restriction_type = starboard.channel_restriction_type.unwrap_or(RestrictionType::None);
    if restriction_type == RestrictionType::None {
        return true;
    }

    let Some(restricted_channels_u64) = &starboard.restricted_channels else {
        return matches!(restriction_type, RestrictionType::AllExcept);
    };

    let restricted_channels = restricted_channels_u64
        .iter()
        .map(|id| ChannelId::from(*id as u64))
        .collect::<Vec<ChannelId>>();

    match restriction_type {
        RestrictionType::AllExcept => !restricted_channels.contains(&reaction.channel_id),
        RestrictionType::OnlyThese => restricted_channels.contains(&reaction.channel_id),
        RestrictionType::None => true,
    }
}

fn is_message_age_allowed(starboard: &Starboard, message_timestamp: i64) -> bool {
    let now = Utc::now().timestamp_millis();
    let message_age_ms = now - message_timestamp;

    if let Some(min_age) = starboard.min_message_age {
        if message_age_ms < calculate_duration_ms(min_age.days, min_age.months, min_age.microseconds) {
            return false;
        }
    }

    if let Some(max_age) = starboard.max_message_age {
        if message_age_ms > calculate_duration_ms(max_age.days, max_age.months, max_age.microseconds) {
            return false;
        }
    }

    true
}

#[inline]
fn calculate_duration_ms(days: i32, months: i32, microseconds: i64) -> i64 {
    (days as i64 * 86_400_000)
        + (months as i64 * 2_592_000_000)
        + (microseconds / 1000)
}

fn member_has_any_role(member: &Member, target_role_ids: &[RoleId]) -> bool {
    member.roles.iter().any(|role_id| target_role_ids.contains(role_id))
}