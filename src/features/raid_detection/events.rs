use serenity::all::{Member};
use tracing::info;
use tracing::log::debug;
use crate::{Data, Error};
use crate::core::config::settings::get_settings;
use crate::features::raid_detection::implementation::DynamicRaidDetector;

pub async fn handle_raid_detection(
    data: &Data,
    new_member: &Member,
) -> Result<(), Error> {
    let guild_id = new_member.guild_id.get();
    let user_id = new_member.user.id.get();

    let Some(raid_config) = get_settings(
        &data.db, &data.redis, &data.guild_configs, guild_id as i64,
    ).await?.raid_detection else {
        return Ok(());
    };

    let detector = DynamicRaidDetector::new(
        data.redis.clone(), raid_config.window_size_seconds,
        raid_config.z_score_multiplier, raid_config.min_safe_limit,
    );

    let result = detector.record_join(guild_id, user_id).await?;
    if result.is_anomaly {
        info!(
            "Raid detected in guild {}! Joins 1m: {} | Threshold: {}",
            guild_id, result.current_joins_1m, result.calculated_threshold
        );

        // TODO: Lockdown guild, kick member, or notify mods!
    } else {
        debug!(
            "Member join recorded. Joins 1m: {}/{}",
            result.current_joins_1m, result.calculated_threshold
        );
    }

    Ok(())
}