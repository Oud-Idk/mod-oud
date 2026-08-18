use crate::{
    features::automod::types::{HasBaseRule, RuleScope, ScopeMode},
    shared::permissions::HasRoles,
};
use serenity::{
    all::Message,
    model::{guild::PartialMember, id::ChannelId},
};
use tracing::trace;

/// Checks whether a message should be exempt/enforoced based on a `RuleScope`.
/// Channel and role checks apply here.
pub fn should_skip_scope(message: &Message, scope: &RuleScope) -> bool {
    let channel_id = message.channel_id;

    let has_matching_role = || {
        message
            .member
            .as_ref()
            .is_some_and(|m| m.has_any_role(&scope.roles))
    };

    match scope.mode {
        ScopeMode::Exempt => {
            if scope.channels.contains(&channel_id) {
                trace!("Skipping rule check: target channel is exempt");
                return true;
            }
            if has_matching_role() {
                trace!("Skipping rule check: user possesses an exempt role");
                return true;
            }
        }
        ScopeMode::Enforced => {
            if !scope.channels.contains(&channel_id) {
                trace!("Skipping rule check: target channel is not enforced");
                return true;
            }
            if !scope.roles.is_empty() && !has_matching_role() {
                trace!("Skipping rule check: user lacks required enforced role");
                return true;
            }
        }
    }

    false
}

fn should_be_skipped<T: HasBaseRule>(message: &Message, rule: &T) -> bool {
    should_skip_scope(message, &rule.base().scope)
}

pub fn check_rule<'a, T: HasBaseRule>(rule_opt: Option<&'a T>, message: &Message) -> Option<&'a T> {
    let rule = rule_opt?;

    if !rule.base().enabled {
        return None;
    }

    if should_be_skipped(message, rule) {
        return None;
    }

    Some(rule)
}

pub fn should_apply_filter(
    scope: &RuleScope,
    channel_id: ChannelId,
    member: Option<&PartialMember>,
) -> bool {
    let is_channel_matched = scope.channels.contains(&channel_id);
    let is_role_matched = member.is_some_and(|m| m.has_any_role(&scope.roles));
    let is_matched = is_channel_matched || is_role_matched;

    match scope.mode {
        ScopeMode::Exempt => !is_matched,
        ScopeMode::Enforced => is_matched,
    }
}
