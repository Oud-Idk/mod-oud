use crate::features::starboard::types::{RestrictionType, Starboard};
use crate::shared::permissions::HasRoles;
use chrono::Utc;
use serenity::all::{Member, Message, Reaction, UserId};

pub fn is_event_allowed(
    starboard: &Starboard,
    reaction: &Reaction,
    message: &Message,
    member: &Member,
    user_id: UserId,
) -> bool {
    if !is_channel_allowed(starboard, reaction) {
        return false;
    }

    if starboard.prevent_self_star && user_id == message.author.id {
        return false;
    }

    if !starboard.allow_bot_messages && message.author.bot {
        return false;
    }

    if !is_message_age_allowed(starboard, message.timestamp.timestamp_millis()) {
        return false;
    }

    is_role_allowed(starboard, member)
}

fn is_role_allowed(starboard: &Starboard, member: &Member) -> bool {
    let restriction_type = starboard.role_restriction_type;
    if restriction_type == RestrictionType::None {
        return true;
    }
    let restricted_roles = &starboard.restricted_roles;

    match restriction_type {
        RestrictionType::AllExcept => !member.has_any_role(restricted_roles),
        RestrictionType::OnlyThese => member.has_any_role(restricted_roles),
        RestrictionType::None => true,
    }
}

fn is_channel_allowed(starboard: &Starboard, reaction: &Reaction) -> bool {
    let restriction_type = starboard.channel_restriction_type;
    if restriction_type == RestrictionType::None {
        return true;
    }
    let restricted_channels = &starboard.restricted_channels;

    match restriction_type {
        RestrictionType::AllExcept => !restricted_channels.contains(&reaction.channel_id),
        RestrictionType::OnlyThese => restricted_channels.contains(&reaction.channel_id),
        RestrictionType::None => true,
    }
}

fn is_message_age_allowed(starboard: &Starboard, message_timestamp: i64) -> bool {
    let now = Utc::now().timestamp_millis();
    let message_age_ms = now - message_timestamp;

    if let Some(min_age) = starboard.min_message_age
        && message_age_ms
            < calculate_duration_ms(min_age.days, min_age.months, min_age.microseconds)
    {
        return false;
    }

    if let Some(max_age) = starboard.max_message_age
        && message_age_ms
            > calculate_duration_ms(max_age.days, max_age.months, max_age.microseconds)
    {
        return false;
    }

    true
}

#[inline]
const fn calculate_duration_ms(days: i32, months: i32, microseconds: i64) -> i64 {
    (days as i64 * 86_400_000) + (months as i64 * 2_592_000_000) + (microseconds / 1000)
}
