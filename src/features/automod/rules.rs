use serenity::all::Message;
use tracing::trace;
use crate::features::automod::types::{HasBaseRule, RuleScope, ScopeMode};

pub fn should_skip_scope(message: &Message, scope: &RuleScope) -> bool {
    let current_channel_id = message.channel_id;
    let is_channel_matched = scope.channels.contains(&current_channel_id.get());

    let has_matching_role = || -> bool {
        let Some(member) = &message.member else {
            return false;
        };
        member.roles.iter().any(|role_id| {
            scope.roles.contains(&role_id.get())
        })
    };

    match scope.mode {
        ScopeMode::Exempt => {
            if is_channel_matched {
                trace!("Skipping rule check: target channel is exempt");
                return true;
            }
            if has_matching_role() {
                trace!("Skipping rule check: user possesses an exempt role");
                return true;
            }
        }
        ScopeMode::Enforced => {
            if !is_channel_matched {
                trace!("Skipping rule check: target channel is not enforced");
                return true;
            }

            let role_enforced_but_missing = !scope.roles.is_empty() && !has_matching_role();
            if role_enforced_but_missing {
                trace!("Skipping rule check: user lacks required enforced role");
                return true;
            }
        }
    }

    false
}

fn should_be_skipped<T: HasBaseRule>(
    message: &Message,
    rule: &T,
) -> bool {
    should_skip_scope(message, &rule.base().scope)
}

pub fn check_rule<'a, T: HasBaseRule>(
    rule_opt: Option<&'a T>,
    message: &Message,
) -> Option<&'a T> {
    let rule = rule_opt?;

    if !rule.base().enabled {
        return None;
    }

    if should_be_skipped(message, rule) {
        return None;
    }

    Some(rule)
}

pub fn should_apply_filter(scope: &RuleScope, channel_id: u64, user_roles: &[u64]) -> bool {
    let is_channel_matched = scope.channels.contains(&channel_id);
    let is_role_matched = user_roles.iter().any(|role| scope.roles.contains(role));
    let is_matched = is_channel_matched || is_role_matched;

    let result = match scope.mode {
        ScopeMode::Exempt => !is_matched,
        ScopeMode::Enforced => is_matched,
    };

    trace!(
        is_matched,
        result,
        channel_id,
        "Checked filter applicability for scope"
    );
    result
}