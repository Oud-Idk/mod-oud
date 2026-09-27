use crate::features::leveling::types::LevelReward;
use serenity::all::{Context, GuildId, RoleId, UserId};
use tracing::{debug, warn};

pub async fn fetch_member_roles(
    ctx: &Context,
    guild_id: GuildId,
    user_id: UserId,
) -> Option<Vec<RoleId>> {
    match ctx.http.get_member(guild_id, user_id).await {
        Ok(member) => {
            debug!(%guild_id, %user_id, "member roles fetched");
            Some(member.roles)
        }
        Err(e) => {
            warn!(
                %guild_id,
                %user_id,
                error = ?e,
                fallback = "no member roles",
                "member role lookup failed"
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

    if active_reward.remove_previous_roles {
        roles_to_add.extend(active_reward.roles_to_add.iter().copied());

        let lower_rewards = eligible_rewards
            .iter()
            .filter(|r| r.level_requirement < active_reward.level_requirement);

        for prev_reward in lower_rewards {
            roles_to_remove.extend(prev_reward.roles_to_add.iter().copied());
        }
    } else {
        for reward in eligible_rewards {
            roles_to_add.extend(reward.roles_to_add.iter().copied());
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
        if let Some(current_roles) = member_roles
            && current_roles.contains(&role_id)
        {
            debug!(%role_id, "user already holds the role");
            continue;
        }

        if let Err(e) = ctx
            .http
            .add_member_role(guild_id, user_id, role_id, Some("Level reward granted"))
            .await
        {
            warn!(%guild_id, %user_id, %role_id, error = %e, "level reward role not added");
            continue;
        }
        debug!(%guild_id, %user_id, %role_id, "added level reward role");
    }

    for role_id in roles_to_remove {
        if let Some(current_roles) = member_roles
            && !current_roles.contains(&role_id)
        {
            debug!(%role_id, "user does not hold the role");
            continue;
        }

        if let Err(e) = ctx
            .http
            .remove_member_role(guild_id, user_id, role_id, Some("Level reward cleanup"))
            .await
        {
            warn!(%guild_id, %user_id, %role_id, error = %e, "level reward role not removed");
            continue;
        }

        debug!(%guild_id, %user_id, %role_id, "removed level reward role");
    }
}
