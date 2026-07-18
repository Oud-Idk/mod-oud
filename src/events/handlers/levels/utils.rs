use crate::events::handlers::levels::cache::save_user_level_cache;
use crate::events::handlers::levels::database::fetch_level_rewards;
use crate::events::handlers::levels::reward::{apply_role_modifications, determine_role_changes, fetch_member_roles};
use crate::events::handlers::levels::{calculation, database};
use crate::types::config::leveling::LevelingConfig;
use crate::types::leveling::LevelReward;
use crate::types::leveling::UserLevel;
use crate::types::Error;
use fred::clients::Client;
use serenity::all::{Context, GuildId, UserId};
use sqlx::PgPool;
use tracing::{debug, info, instrument};

/// Main entry point to evaluate and update level-based rewards.
#[instrument(
    skip(ctx, db),
    fields(
        guild_id = %guild_id.get(),
        user_id = %user_id.get(),
        new_level
    )
)]
pub async fn apply_level_rewards(
    ctx: &Context,
    db: &PgPool,
    guild_id: &GuildId,
    user_id: UserId,
    new_level: i32,
) -> Result<(), Error> {
    debug!("Fetching level rewards from database");
    let rewards = fetch_level_rewards(db, guild_id.get() as i64).await?;

    let mut eligible_rewards: Vec<&LevelReward> = rewards
        .iter()
        .filter(|r| r.level_requirement <= new_level)
        .collect();

    if eligible_rewards.is_empty() {
        debug!("No eligible level rewards found for level {}", new_level);
        return Ok(());
    }

    eligible_rewards.sort_by_key(|r| r.level_requirement);
    let active_reward = *eligible_rewards.last().unwrap();

    let (roles_to_add, roles_to_remove) = determine_role_changes(&eligible_rewards, active_reward);

    debug!(
        roles_to_add = ?roles_to_add,
        roles_to_remove = ?roles_to_remove,
        "Determined role modifications"
    );

    debug!("Fetching current roles for member");
    let member_roles = fetch_member_roles(ctx, *guild_id, user_id).await;

    info!(
        "Applying role modifications to user: adding {:?}, removing {:?}",
        roles_to_add, roles_to_remove
    );

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

pub async fn clamp_to_level_cap(leveling_config: &LevelingConfig, redis: &Client, db: &PgPool, stats_key: &str, user_level: &mut UserLevel) -> Result<bool, Error> {
    if leveling_config.level_cap > 0 && user_level.current_level >= leveling_config.level_cap as i32 {
        let mut needs_update = false;
        if user_level.current_level > leveling_config.level_cap as i32 {
            user_level.current_level = leveling_config.level_cap as i32;
            needs_update = true;
        }
        if user_level.current_xp > 0 {
            user_level.current_xp = 0;
            needs_update = true;
        }
        if needs_update {
            user_level.cumulative_xp = calculation::calculate_cumulative_xp(user_level.current_level, user_level.current_xp);
            database::update_level(db, &user_level).await?;
            let serialized = serde_json::to_string(&user_level)?;
            let _: () = save_user_level_cache(redis, stats_key, serialized).await?;
        }
        return Ok(true);
    }
    Ok(false)
}