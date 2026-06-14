use crate::core::config::{get_guild_ctx, replace_starboard_placeholders};
use crate::types::config::starboard::{RestrictionType, Starboard, StarboardRow};
use crate::types::types::{Data, Error};
use redis::aio::MultiplexedConnection;
use redis::{AsyncCommands, RedisError};
use serenity::all::{Channel, ChannelId, Context, CreateMessage, EditMessage, GuildChannel, GuildId, Member, Message, MessageId, Reaction, ReactionType, RoleId, UserId};
use sqlx::types::chrono::Utc;
use sqlx::PgPool;

pub async fn get_starboards(guild_id: &str, db: &PgPool) -> Result<Vec<Starboard>, sqlx::Error> {
    let rows = sqlx::query_as::<_, StarboardRow>(
        r#"
        SELECT *
        FROM starboards
        WHERE guild_id = $1
        "#,
    )
        .bind(guild_id)
        .fetch_all(db)
        .await?;

    rows.into_iter()
        .map(Starboard::try_from)
        .collect::<Result<Vec<Starboard>, _>>()
        .map_err(|e| sqlx::Error::Decode(Box::new(e)))
}

pub async fn count_emoji_and_cache(ctx: &Context, value: Option<u64>, msg: &Message, removed_reaction: &Reaction, starboard: &Starboard, redis: &mut MultiplexedConnection, cached_key: &str) -> Result<u64, RedisError> {
    match value {
        Some(count) => Ok(count),
        None => {
            let mut count = msg
                .reactions
                .iter()
                .find(|r| emoji_matches(&r.reaction_type, &removed_reaction.emoji))
                .map(|r| r.count)
                .unwrap_or(0);

            if starboard.prevent_self_star.unwrap_or(false) {
                let has_author_reacted = has_user_reacted(ctx, removed_reaction.channel_id, removed_reaction.message_id, &removed_reaction.emoji, msg.author.id).await.unwrap_or(false);
                if has_author_reacted && count > 0 {
                    count -= 1;
                }
            }

            let _: () = redis.set_ex(&cached_key, count, 3600).await?;
            Ok(count)
        }
    }
}

fn is_role_allowed(starboard: &Starboard, member: &Member) -> bool {
    let restriction_type = starboard.role_restriction_type.unwrap_or(RestrictionType::None);
    if restriction_type == RestrictionType::None {
        return true;
    }

    let Some(restricted_roles) = &starboard.restricted_roles else {
        return matches!(restriction_type, RestrictionType::AllExcept);
    };

    let roles = restricted_roles
        .iter()
        .map(|id| RoleId::from(*id as u64))
        .collect::<Vec<RoleId>>();

    match restriction_type {
        RestrictionType::AllExcept => !member_has_any_role(member, &roles),
        RestrictionType::OnlyThese => member_has_any_role(member, &roles),
        RestrictionType::None => true,
    }
}

fn is_channel_allowed(starboard: &Starboard, reaction: &Reaction) -> bool {
    let restriction_type = starboard.channel_restriction_type.unwrap_or(RestrictionType::None);
    if restriction_type == RestrictionType::None {
        return true;
    }

    let Some(restricted_channels_u64) = &starboard.restricted_channels else {
        return matches!(restriction_type, RestrictionType::AllExcept);
    };

    let restricted_channels = restricted_channels_u64
        .iter()
        .map(|id| ChannelId::from(*id as u64))
        .collect::<Vec<ChannelId>>();

    match restriction_type {
        RestrictionType::AllExcept => !restricted_channels.contains(&reaction.channel_id),
        RestrictionType::OnlyThese => restricted_channels.contains(&reaction.channel_id),
        RestrictionType::None => true,
    }
}

fn member_has_any_role(member: &Member, target_role_ids: &[RoleId]) -> bool {
    member.roles.iter().any(|role_id| target_role_ids.contains(role_id))
}

async fn get_channel(ctx: &Context, guild_id: GuildId, channel_id: ChannelId) -> Option<GuildChannel> {
    if let Some(channel) = ctx.cache.guild(guild_id).and_then(|g| g.channels.get(&channel_id).cloned()) {
        Some(channel)
    } else {
        match channel_id.to_channel(&ctx.http).await {
            Ok(Channel::Guild(guild_channel)) => Some(guild_channel),
            _ => None,
        }
    }
}

fn is_message_age_allowed(starboard: &Starboard, message_timestamp: i64) -> bool {
    let now = Utc::now().timestamp_millis();
    let message_age_ms = now - message_timestamp;

    if let Some(min_age) = starboard.min_message_age {
        let min_age_ms = (min_age.days as i64 * 86_400_000)
            + (min_age.months as i64 * 2_592_000_000)
            + (min_age.microseconds / 1000);

        if message_age_ms < min_age_ms {
            return false;
        }
    }

    if let Some(max_age) = starboard.max_message_age {
        let max_age_ms = (max_age.days as i64 * 86_400_000)
            + (max_age.months as i64 * 2_592_000_000)
            + (max_age.microseconds / 1000);

        if message_age_ms > max_age_ms {
            return false;
        }
    }

    true
}

fn emoji_matches(a: &ReactionType, b: &ReactionType) -> bool {
    match (a, b) {
        (ReactionType::Custom { id: id_a, .. }, ReactionType::Custom { id: id_b, .. }) => id_a == id_b,
        (ReactionType::Unicode(uni_a), ReactionType::Unicode(uni_b)) => uni_a == uni_b,
        _ => false,
    }
}

async fn resolve_member(ctx: &Context, guild_id: GuildId, user_id: UserId, reaction: &Reaction) -> Option<Member> {
    if let Some(member) = &reaction.member {
        return Some(member.clone());
    }
    if let Some(member) = ctx.cache.guild(guild_id).and_then(|g| g.members.get(&user_id).cloned()) {
        return Some(member);
    }
    ctx.http.get_member(guild_id, user_id).await.ok()
}

async fn has_user_reacted(
    ctx: &Context,
    channel_id: ChannelId,
    message_id: MessageId,
    emoji: &ReactionType,
    user_id: UserId,
) -> Result<bool, Error> {
    let users = channel_id
        .reaction_users(&ctx.http, message_id, emoji.clone(), Some(100), None)
        .await?;
    Ok(users.iter().any(|u| u.id == user_id))
}

pub async fn upsert_starboard(
    ctx: &Context,
    db: &PgPool,
    starboard: &Starboard,
    reaction: &Reaction,
    member: &Member,
    emoji_count: u64,
) -> Result<(), Error> {
    let starboard_channel = ChannelId::new(starboard.starboard_channel_id);
    let threshold = starboard.reaction_threshold.unwrap_or(10) as u64;
    let orig_msg_id = reaction.message_id;
    let Some(guild_id) = reaction.guild_id else { return Ok(()) };

    let existing_post_id = sqlx::query_scalar!(
        r#"
        SELECT starboard_message_id
        FROM starred_messages
        WHERE original_message_id = $1 AND starboard_id = $2
        "#,
        orig_msg_id.to_string(),
        starboard.id
    )
        .fetch_optional(db)
        .await?
        .flatten();

    let starboard_msg_id = existing_post_id
        .and_then(|id| id.parse::<u64>().ok())
        .map(MessageId::new);

    // Scenario A: Below threshold & doesn't exist yet -> DO NOTHING.
    if emoji_count < threshold && starboard_msg_id.is_none() {
        return Ok(());
    }

    // Scenario B: Below threshold but post exists -> Demote (Delete from Discord & DB)
    if emoji_count < threshold {
        if let Some(post_id) = starboard_msg_id {
            let _ = starboard_channel.delete_message(&ctx.http, post_id).await;

            sqlx::query!(
                "DELETE FROM starred_messages WHERE original_message_id = $1 AND starboard_id = $2",
                orig_msg_id.to_string(),
                starboard.id
            )
                .execute(db)
                .await?;

            return Ok(());
        }
    }

    // Scenario C: Meets threshold -> Create or edit the post.
    let Some(guild_starboard_channel) = get_channel(ctx, guild_id, starboard_channel).await else { return Ok(()) };
    let Some(origin_channel) = get_channel(ctx, guild_id, reaction.channel_id).await else { return Ok(()) };
    let origin_message = reaction.message(&ctx).await?;
    let gctx = get_guild_ctx(guild_id, ctx).await?;

    if let Some(embed_template) = &starboard.embed_template {
        if let Some(text_template) = &starboard.plaintext_template {
            let embedded_message = embed_template.to_embed(|text| {
                replace_starboard_placeholders(
                    text, &gctx, member, &guild_starboard_channel, &origin_channel, &origin_message, starboard, &emoji_count,
                )
            })?;

            let text_message = replace_starboard_placeholders(
                text_template, &gctx, member, &guild_starboard_channel, &origin_channel, &origin_message, starboard, &emoji_count,
            );

            match starboard_msg_id {
                Some(post_id) => {
                    let builder = EditMessage::new()
                        .content(text_message)
                        .embed(embedded_message);

                    starboard_channel.edit_message(&ctx.http, post_id, builder).await?;

                    sqlx::query!(
                        r#"
                        UPDATE starred_messages
                        SET star_count = $1
                        WHERE original_message_id = $2 AND starboard_id = $3
                        "#,
                        emoji_count as i32,
                        orig_msg_id.to_string(),
                        starboard.id
                    )
                        .execute(db)
                        .await?;
                }
                None => {
                    let builder = CreateMessage::new()
                        .content(text_message)
                        .embed(embedded_message);

                    let sent_msg = starboard_channel.send_message(&ctx.http, builder).await?;

                    sqlx::query!(
                        r#"
                        INSERT INTO starred_messages (
                            original_message_id, starboard_message_id, starboard_id,
                            guild_id, channel_id, author_id, star_count
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                        "#,
                        orig_msg_id.to_string(),
                        sent_msg.id.to_string(),
                        starboard.id,
                        guild_id.to_string(),
                        reaction.channel_id.to_string(),
                        origin_message.author.id.to_string(),
                        emoji_count as i32
                    )
                        .execute(db)
                        .await?;
                }
            }
        }
    }

    Ok(())
}

pub async fn handle_starboard_reaction_add(ctx: &Context, add_reaction: &Reaction, data: &Data) -> Result<(), Error> {
    let db = &data.db;
    let mut redis = data.redis.clone();

    let Some(guild_id) = add_reaction.guild_id else { return Ok(()) };
    let Some(user_id) = add_reaction.user_id else { return Ok(()) };
    let guild_id_str = guild_id.to_string();

    let starboards = get_starboards(&guild_id_str, db).await?;
    if starboards.is_empty() { return Ok(()); }

    let Some(member) = resolve_member(ctx, guild_id, user_id, add_reaction).await else { return Ok(()) };
    let message = add_reaction.message(&ctx.http).await?;

    for starboard in starboards {
        if !is_channel_allowed(&starboard, add_reaction) { continue; }

        // 1. Prevent Self-Stars
        if starboard.prevent_self_star.unwrap_or(false) && user_id == message.author.id {
            continue;
        }

        // 2. Filter Bot Messages (defaults to true / allowed, unless explicitly false)
        if !starboard.allow_bot_messages.unwrap_or(true) && message.author.bot {
            continue;
        }

        // 3. Validate message age
        if !is_message_age_allowed(&starboard, message.timestamp.timestamp_millis()) {
            continue;
        }

        let user_allowed = is_role_allowed(&starboard, &member);
        let allowed_cache_key = format!(
            "starboard:allowed:{}:{}:{}",
            guild_id_str,
            starboard.id,
            user_id
        );
        let maybe_user_allowed_cache_val: Option<bool> = redis.get(&allowed_cache_key).await?;

        if maybe_user_allowed_cache_val != Some(user_allowed) {
            let _: () = redis.set_ex(&allowed_cache_key, user_allowed, 3600).await?;
        }

        if !user_allowed {
            continue;
        }

        let Some(emojis) = &starboard.emojis else { return Ok(()) };
        let emoji_string = &add_reaction.emoji.to_string();
        if emojis.contains(emoji_string) {
            let cached_key = format!(
                "starboard:guild:{}:{}:{}:{}",
                guild_id,
                add_reaction.message_id.get(),
                starboard.id,
                emoji_string
            );

            let incr_exist_script = redis::Script::new(r#"
                if redis.call("EXISTS", KEYS[1]) == 1 then
                    return redis.call("INCR", KEYS[1])
                else
                    return nil
                end
            "#);

            let maybe_count: Option<u64> = incr_exist_script
                .key(&cached_key)
                .invoke_async(&mut redis)
                .await?;

            let emoji_count = count_emoji_and_cache(ctx, maybe_count, &message, &add_reaction, &starboard, &mut redis, &cached_key).await?;

            let _ = upsert_starboard(ctx, db, &starboard, add_reaction, &member, emoji_count).await;
        }
    }

    Ok(())
}

pub async fn handle_starboard_reaction_remove(ctx: &Context, removed_reaction: &Reaction, data: &Data) -> Result<(), Error> {
    let db = &data.db;
    let mut redis = data.redis.clone();

    let Some(guild_id) = removed_reaction.guild_id else { return Ok(()) };
    let Some(user_id) = removed_reaction.user_id else { return Ok(()) };
    let guild_id_str = guild_id.to_string();

    let starboards = get_starboards(&guild_id_str, db).await?;
    if starboards.is_empty() { return Ok(()); }

    let Some(member) = resolve_member(ctx, guild_id, user_id, removed_reaction).await else { return Ok(()) };
    let message = removed_reaction.message(&ctx.http).await?;

    for starboard in starboards {
        if !is_channel_allowed(&starboard, removed_reaction) { continue; }

        // 1. Prevent Self-Stars
        if starboard.prevent_self_star.unwrap_or(false) && user_id == message.author.id {
            continue;
        }

        // 2. Filter Bot Messages (defaults to true / allowed, unless explicitly false)
        if !starboard.allow_bot_messages.unwrap_or(true) && message.author.bot {
            continue;
        }

        // 3. Validate message age
        if !is_message_age_allowed(&starboard, message.timestamp.timestamp_millis()) {
            continue;
        }

        let allowed_cache_key = format!("starboard:allowed:{}:{}:{}", guild_id_str, starboard.id, user_id);
        let maybe_user_allowed: Option<bool> = redis.get(&allowed_cache_key).await?;

        let user_allowed = match maybe_user_allowed {
            Some(allowed) => allowed,
            None => {
                let allowed = is_role_allowed(&starboard, &member);
                let _: () = redis.set_ex(&allowed_cache_key, allowed, 3600).await?;
                allowed
            }
        };

        if !user_allowed {
            continue;
        }

        let Some(emojis) = &starboard.emojis else { return Ok(()) };
        let emoji_string = &removed_reaction.emoji.to_string();
        if emojis.contains(emoji_string) {
            let cached_key = format!(
                "starboard:guild:{}:{}:{}:{}",
                guild_id,
                removed_reaction.message_id.get(),
                starboard.id,
                emoji_string
            );
            let decr_exist_script = redis::Script::new(r#"
                if redis.call("EXISTS", KEYS[1]) == 1 then
                    return redis.call("DECR", KEYS[1])
                else
                    return nil
                end
            "#);

            let val: Option<u64> = decr_exist_script
                .key(&cached_key)
                .invoke_async(&mut redis)
                .await?;

            let emoji_count = count_emoji_and_cache(ctx, val, &message, &removed_reaction, &starboard, &mut redis, &cached_key).await?;

            let _ = upsert_starboard(ctx, db, &starboard, removed_reaction, &member, emoji_count).await;
        }
    }
    Ok(())
}