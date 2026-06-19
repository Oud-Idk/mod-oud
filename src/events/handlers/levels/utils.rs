use crate::events::handlers::levels::database::fetch_level_rewards;
use crate::events::handlers::levels::levels_text::LevelReward;
use crate::events::handlers::levels::reward::{apply_role_modifications, determine_role_changes, fetch_member_roles};
use crate::types::Error;
use serenity::all::{Context, GuildId, UserId};
use sqlx::PgPool;

/// Main entry point to evaluate and update level-based rewards.
pub async fn apply_level_rewards(
    ctx: &Context,
    db: &PgPool,
    guild_id: &GuildId,
    user_id: UserId,
    new_level: i32,
) -> Result<(), Error> {
    let guild_id_str = guild_id.get().to_string();

    let rewards = fetch_level_rewards(db, &guild_id_str).await?;
    let mut eligible_rewards: Vec<&LevelReward> = rewards
        .iter()
        .filter(|r| r.level_requirement <= new_level)
        .collect();

    if eligible_rewards.is_empty() {
        return Ok(());
    }
    eligible_rewards.sort_by_key(|r| r.level_requirement);

    let active_reward = *eligible_rewards.last().unwrap();

    let (roles_to_add, roles_to_remove) = determine_role_changes(&eligible_rewards, active_reward);
    let member_roles = fetch_member_roles(ctx, *guild_id, user_id).await;

    apply_role_modifications(
        ctx,
        *guild_id,
        user_id,
        member_roles.as_deref(),
        roles_to_add,
        roles_to_remove,
    )
        .await;

    Ok(())
}
