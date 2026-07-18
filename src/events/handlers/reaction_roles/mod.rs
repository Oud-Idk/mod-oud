use crate::types::{Data, Error};
use axum::routing::trace;
use fred::interfaces::KeysInterface;
use fred::types::Expiration;
use poise::serenity_prelude as serenity;
use serenity::all::{Context, Reaction, RoleId};
use tracing::{debug, error, info, trace, warn};

/// Retrieves the Role ID associated with a message and emoji, utilizing Redis caching.
async fn get_reaction_role(
    data: &Data,
    message_id: i64,
    emoji: &str,
) -> Result<Option<RoleId>, Error> {
    let cache_key = format!("reaction_role:{}:{}", message_id, emoji);

    match data.redis.get::<Option<String>, _>(&cache_key).await {
        Ok(Some(cached_val)) => {
            if cached_val == "none" {
                return Ok(None);
            }
            if let Ok(role_id_u64) = cached_val.parse::<u64>() {
                return Ok(Some(RoleId::new(role_id_u64)));
            } else {
                error!("Invalid role ID format in Redis cache: {}", cached_val);
            }
        }
        Ok(None) => {
            trace!("Cache miss when finding reaction role. Querying from database.");
        }
        Err(e) => {
            warn!("Redis read error (falling back to database): {}", e);
        }
    }

    let row = sqlx::query!(
        r#"
        SELECT rr.role_id
        FROM reaction_roles rr
        JOIN reaction_messages rm ON rr.reaction_message_id = rm.id
        WHERE rm.message_id = $1 AND rr.emoji = $2
        "#,
        message_id,
        emoji
    )
        .fetch_optional(&data.db)
        .await?;

    if let Some(record) = row {
        let role_id_u64 = record.role_id as u64;

        if let Err(e) = data
            .redis
            .set::<(), _, _>(&cache_key, role_id_u64, None, None, false)
            .await
        {
            warn!("Failed to write reaction role to Redis: {}", e);
        }

        Ok(Some(RoleId::new(role_id_u64)))
    } else {
        let expiration = Expiration::EX(300);
        if let Err(e) = data
            .redis
            .set::<(), _, _>(&cache_key, "none", Some(expiration), None, false)
            .await
        {
            warn!("Failed to write negative cache result to Redis: {}", e);
        }

        Ok(None)
    }
}

pub async fn handle_reaction_role_add(
    ctx: &Context,
    reaction: &Reaction,
    data: &Data,
) -> Result<(), Error> {
    let guild_id = match reaction.guild_id {
        Some(id) => id,
        None => return Ok(()),
    };

    let user_id = match reaction.user_id {
        Some(id) => id,
        None => return Ok(()),
    };

    if user_id == ctx.cache.current_user().id {
        return Ok(());
    }

    let emoji_str = reaction.emoji.to_string();

    if let Some(role_id) = get_reaction_role(data, reaction.message_id.get() as i64, &emoji_str).await? {
        if let Err(err) = ctx.http.add_member_role(guild_id, user_id, role_id, Some("Reaction Role Add")).await {
            warn!("Failed to add role {} to user {}: {}", role_id, user_id, err);
        } else {
            info!("Assigned role {} to user {}", role_id, user_id);
        }
    }

    Ok(())
}

pub async fn handle_reaction_role_remove(
    ctx: &Context,
    reaction: &Reaction,
    data: &Data,
) -> Result<(), Error> {
    let guild_id = match reaction.guild_id {
        Some(id) => id,
        None => return Ok(()),
    };

    let user_id = match reaction.user_id {
        Some(id) => id,
        None => return Ok(()),
    };

    if user_id == ctx.cache.current_user().id {
        return Ok(());
    }

    let emoji_str = reaction.emoji.to_string();

    if let Some(role_id) = get_reaction_role(data, reaction.message_id.get() as i64, &emoji_str).await? {
        if let Err(err) = ctx.http.remove_member_role(guild_id, user_id, role_id, Some("Reaction Role Remove")).await {
            warn!("Failed to remove role {} from user {}: {}", role_id, user_id, err);
        } else {
            info!("Removed role {} from user {}", role_id, user_id);
        }
    }

    Ok(())
}