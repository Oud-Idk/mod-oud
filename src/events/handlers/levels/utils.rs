use crate::events::handlers::levels::database::fetch_level_rewards;
use crate::events::handlers::levels::levels_text::{LevelReward, UserLevel};
use crate::events::handlers::levels::reward::{apply_role_modifications, determine_role_changes, fetch_member_roles};
use crate::events::handlers::levels::{database, redis_cache};
use crate::types::config::leveling::{LevelingConfig, NotificationScope};
use crate::types::config::message_filter::ScopeMode;
use crate::types::Error;
use redis::aio::MultiplexedConnection;
use redis::AsyncCommands;
use serenity::all::{ChannelId, Context, CreateMessage, GuildId, Message, RoleId, User, UserId};
use sqlx::PgPool;

pub async fn get_user_level(conn: &mut MultiplexedConnection, db: &PgPool, guild_id: &GuildId, author_id: &UserId, stats_key: &str) -> Result<UserLevel, Error> {
    let cached_user: Option<String> = conn.get(&stats_key).await?;

    match cached_user {
        Some(json_data) => {
            Ok(serde_json::from_str::<UserLevel>(&json_data)?)
        }
        None => {
            let db_user = database::get_level(db, *guild_id, *author_id).await?;

            let user = match db_user {
                Some(user) => user,
                None => {
                    database::insert_level(db, *guild_id, *author_id).await?
                }
            };

            let serialized = serde_json::to_string(&user)?;
            let _: () = conn.set_ex(&stats_key, serialized, 3600).await?;

            Ok(user)
        }
    }
}

pub async fn should_exclude_from_level_up(
    config: &LevelingConfig,
    author: &User,
    redis_conn: &mut MultiplexedConnection,
    channel_id: &i64,
    guild_id: &u64,
    ctx: &Context,
) -> bool {
    let channel_u64 = *channel_id as u64;
    let guild_id_typed = GuildId::new(*guild_id);
    let cache_key = format!("xp_roles:{}:{}", guild_id, author.id.get());

    let cached_data: Option<String> = redis_conn.get(&cache_key).await.ok();

    let user_roles: Vec<u64> = if let Some(json_str) = cached_data {
        serde_json::from_str(&json_str).unwrap_or_default()
    } else {
        match guild_id_typed.member(&ctx.http, author.id).await {
            Ok(member) => {
                let fetched_roles: Vec<u64> = member.roles.iter().map(|role_id| role_id.get()).collect();

                if let Ok(json_str) = serde_json::to_string(&fetched_roles) {
                    let _: Result<(), _> = redis_conn.set_ex(&cache_key, json_str, 300).await;
                }

                fetched_roles
            }
            Err(_) => {
                Vec::new()
            }
        }
    };

    match config.scope.mode {
        ScopeMode::Exempt => {
            if config.scope.channels.contains(&channel_u64) {
                return true;
            }
            if user_roles.iter().any(|role| config.scope.roles.contains(role)) {
                return true;
            }
            false
        }
        ScopeMode::Enforced => {
            if !config.scope.channels.is_empty() && !config.scope.channels.contains(&channel_u64) {
                return true;
            }
            if !config.scope.roles.is_empty() {
                let has_allowed_role = user_roles.iter().any(|role| config.scope.roles.contains(role));
                if !has_allowed_role {
                    return true;
                }
            }
            false
        }
    }
}

pub async fn get_multiplier(redis: &mut MultiplexedConnection, multiplier_key: &str, db: &PgPool, guild_id: &GuildId, message: &Message) -> Result<f32, Error> {
    let multipliers = redis_cache::cache_aside_multipliers(redis, multiplier_key, db, guild_id).await?;

    let mut applied_multiplier = 1.0f32;
    if !multipliers.is_empty() {
        let channel_id_str = message.channel_id.get().to_string();
        let member_roles: Vec<String> = message
            .member
            .as_ref()
            .map(|m| m.roles.iter().map(|r| r.get().to_string()).collect())
            .unwrap_or_default();

        for mult in multipliers {
            match mult.target_type.as_str() {
                "channel" => {
                    if mult.target_id == channel_id_str {
                        applied_multiplier = applied_multiplier.max(mult.multiplier);
                    }
                }
                "role" => {
                    if member_roles.contains(&mult.target_id) {
                        applied_multiplier = applied_multiplier.max(mult.multiplier);
                    }
                }
                _ => {}
            }
        }
    }

    Ok(applied_multiplier)
}

pub async fn send_according_to_config(ctx: &&Context, message: &Message, config: &LevelingConfig, author: &User, msg: CreateMessage) -> Result<(), Error> {
    match config.notify.scope {
        NotificationScope::CurrentChannel => {
            message.channel_id.send_message(ctx.http.clone(), msg).await?;
        },
        NotificationScope::SpecifiedChannel => {
            if let Some(channel_id) = config.notify.channel_id {
                ChannelId::from(channel_id).send_message(ctx.http.clone(), msg).await?;
            }
        },
        NotificationScope::Dm => {
            let _ = author.dm(&ctx.http, msg).await;
        }
        _ => {}
    }
    Ok(())
}

pub async fn get_voice_multiplier(
    redis: &mut MultiplexedConnection,
    multiplier_key: &str,
    db: &PgPool,
    guild_id: &GuildId,
    channel_id: ChannelId,
    member_roles: &[RoleId],
) -> Result<f32, Error> {
    let multipliers = redis_cache::cache_aside_multipliers(redis, multiplier_key, db, guild_id).await?;

    let mut applied_multiplier = 1.0f32;
    if !multipliers.is_empty() {
        let channel_id_str = channel_id.get().to_string();
        let role_ids_str: Vec<String> = member_roles.iter().map(|r| r.get().to_string()).collect();

        for mult in multipliers {
            match mult.target_type.as_str() {
                "channel" => {
                    if mult.target_id == channel_id_str {
                        applied_multiplier = applied_multiplier.max(mult.multiplier);
                    }
                }
                "role" => {
                    if role_ids_str.contains(&mult.target_id) {
                        applied_multiplier = applied_multiplier.max(mult.multiplier);
                    }
                }
                _ => {}
            }
        }
    }

    Ok(applied_multiplier)
}

pub async fn send_voice_according_to_config(
    ctx: &Context,
    voice_channel_id: ChannelId,
    config: &LevelingConfig,
    user: &User,
    msg: CreateMessage,
) -> Result<(), Error> {
    match config.notify.scope {
        NotificationScope::CurrentChannel => {
            // Sends the notification directly to the text channel of the VC
            voice_channel_id.send_message(&ctx.http, msg).await?;
        },
        NotificationScope::SpecifiedChannel => {
            if let Some(channel_id) = config.notify.channel_id {
                ChannelId::from(channel_id).send_message(&ctx.http, msg).await?;
            }
        },
        NotificationScope::Dm => {
            let _ = user.dm(&ctx.http, msg).await;
        }
        _ => {}
    }
    Ok(())
}

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