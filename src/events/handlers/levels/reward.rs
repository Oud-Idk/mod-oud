use crate::events::handlers::levels::levels_text::LevelReward;
use log::warn;
use serenity::all::{Context, GuildId, RoleId, UserId};
use tracing::{debug, trace};

pub fn parse_role_ids(roles_opt: &Option<Vec<String>>) -> Vec<RoleId> {
    roles_opt
        .as_ref()
        .map(|roles| {
            roles.iter()
                .filter_map(|r| match r.parse::<u64>() {
                    Ok(val) => Some(RoleId::new(val)),
                    Err(_) => {
                        warn!("Failed to parse role ID: {}", r);
                        None
                    }
                })
                .collect()
        })
        .unwrap_or_default()
}

pub async fn fetch_member_roles(
    ctx: &Context,
    guild_id: GuildId,
    user_id: UserId,
) -> Option<Vec<RoleId>> {
    match ctx.http.get_member(guild_id, user_id).await {
        Ok(member) => {
            debug!("Fetch {}'s roles", user_id);
            Some(member.roles)
        },
        Err(e) => {
            warn!(
                "Could not fetch roles for user {}: {}. Proceeding without cache.",
                user_id, e
            );
            None
        }
    }
}

pub fn determine_role_changes(
    eligible_rewards: &[&LevelReward],
    active_reward: &LevelReward,
) -> (Vec<RoleId>, Vec<RoleId>) {
    let mut roles_to_add = Vec::new();
    let mut roles_to_remove = Vec::new();

    if active_reward.remove_previous_roles.unwrap_or(false) {
        roles_to_add.extend(parse_role_ids(&active_reward.roles_to_add));

        let lower_rewards = eligible_rewards
            .iter()
            .filter(|r| r.level_requirement < active_reward.level_requirement);

        for prev_reward in lower_rewards {
            roles_to_remove.extend(parse_role_ids(&prev_reward.roles_to_add));
        }
    } else {
        for reward in eligible_rewards {
            roles_to_add.extend(parse_role_ids(&reward.roles_to_add));
        }
    }

    (roles_to_add, roles_to_remove)
}

pub async fn apply_role_modifications(
    ctx: &Context,
    guild_id: GuildId,
    user_id: UserId,
    member_roles: Option<&[RoleId]>,
    roles_to_add: Vec<RoleId>,
    roles_to_remove: Vec<RoleId>,
) {
    for role_id in roles_to_add {
        if let Some(current_roles) = member_roles {
            if current_roles.contains(&role_id) {
                trace!(role_id = role_id.get(), "User already contains role");
                continue;
            }
        }

        if let Err(e) = ctx.http.add_member_role(guild_id, user_id, role_id, Some("Level reward granted")).await {
            warn!("Failed to add role {} to user {}: {}", role_id, user_id, e);
            continue;
        }
        debug!("Added role {} to user {}", role_id, user_id);
    }

    for role_id in roles_to_remove {
        if let Some(current_roles) = member_roles {
            if !current_roles.contains(&role_id) {
                trace!(role_id = role_id.get(), "User already doesn't contains role");
                continue;
            }
        }

        if let Err(e) = ctx.http.remove_member_role(guild_id, user_id, role_id, Some("Level reward cleanup")).await {
            warn!("Failed to remove role {} from user {}: {}", role_id, user_id, e);
            continue;
        }

        debug!("Removed role {} from user {}", role_id, user_id);
    }
}