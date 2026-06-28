use crate::events::handlers::levels::text::notify;
use crate::events::handlers::levels::{rules, utils};
use crate::types::config::leveling::{LevelingConfig, NotificationScope};
use crate::types::leveling::UserLevel;
use crate::types::Data;
use serenity::all::{Context, Message};
use tracing::{trace, warn};

pub fn should_skip_leveling(
    message: &Message,
    data: &Data,
    config: &LevelingConfig,
) -> bool {
    let guild_id = message.guild_id.map(|g| g.get()).unwrap_or(0);
    let channel_id_u64 = message.channel_id.get();

    if data.active_tickets.contains_key(&channel_id_u64) {
        trace!(guild_id, channel_id = %channel_id_u64, "Skipping leveling XP: channel is marked as a ticket");
        return true;
    }

    let user_roles: Vec<u64> = message.member.as_ref()
        .map(|m| m.roles.iter().map(|r| r.get()).collect())
        .unwrap_or_default();

    if rules::should_exclude_from_level_up(config, &user_roles, channel_id_u64) {
        trace!(guild_id, author_id = message.author.id.get(), "Skipping leveling XP: member or channel is excluded");
        return true;
    }

    false
}

pub fn spawn_level_up_effects(
    ctx: Context,
    db: &sqlx::PgPool,
    message: Message,
    user_level: UserLevel,
    leveling_config: LevelingConfig,
    previous_level: i32,
) {
    let guild_id_val = message.guild_id.unwrap_or_default();
    let author_id_val = message.author.id;
    let current_level_val = user_level.current_level;
    let db_lvl_up = db.clone();

    tokio::spawn(async move {
        if !matches!(leveling_config.notify.scope, NotificationScope::None) {
            let embed = &leveling_config.notify.embed;
            trace!(guild_id = guild_id_val.get(), author_id = author_id_val.get(), "Initiating level-up notification");

            if let Err(e) = notify::send_message(
                &ctx,
                embed.as_ref(),
                &message,
                &user_level,
                &leveling_config,
                &guild_id_val,
                previous_level
            ).await {
                warn!(error = ?e, "Failed to send level-up notification");
            }
        }

        trace!(guild_id = guild_id_val.get(), author_id = author_id_val.get(), level = current_level_val, "Evaluating reward assignments");
        if let Err(e) = utils::apply_level_rewards(
            &ctx,
            &db_lvl_up,
            &guild_id_val,
            author_id_val,
            current_level_val
        ).await {
            warn!(
                error = ?e,
                guild_id = guild_id_val.get(),
                author_id = author_id_val.get(),
                level = current_level_val,
                "Failed to apply leveling role rewards to member"
            );
        }
    });
}