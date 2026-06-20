use crate::core::config::get_guild_ctx;
use crate::types::config::starboard::{Starboard, StarboardRow};
use crate::types::Error;
use crate::utils::placeholders::replace_starboard_placeholders;
use redis::aio::MultiplexedConnection;
use redis::{AsyncCommands, RedisError};
use serenity::all::{Channel, ChannelId, Context, CreateEmbed, GuildChannel, GuildId, Member, Message, MessageId, Reaction, ReactionType, UserId};
use sqlx::PgPool;

pub async fn get_channel(ctx: &Context, guild_id: GuildId, channel_id: ChannelId) -> Option<GuildChannel> {
    if let Some(channel) = ctx.cache.guild(guild_id).and_then(|g| g.channels.get(&channel_id).cloned()) {
        Some(channel)
    } else {
        match channel_id.to_channel(&ctx.http).await {
            Ok(Channel::Guild(guild_channel)) => Some(guild_channel),
            _ => None,
        }
    }
}

pub fn is_emoji_match(a: &ReactionType, b: &ReactionType) -> bool {
    match (a, b) {
        (ReactionType::Custom { id: id_a, .. }, ReactionType::Custom { id: id_b, .. }) => id_a == id_b,
        (ReactionType::Unicode(uni_a), ReactionType::Unicode(uni_b)) => uni_a == uni_b,
        _ => false,
    }
}

pub async fn resolve_member(ctx: &Context, guild_id: GuildId, user_id: UserId, reaction: &Reaction) -> Option<Member> {
    if let Some(member) = &reaction.member {
        return Some(member.clone());
    }
    if let Some(member) = ctx.cache.guild(guild_id).and_then(|g| g.members.get(&user_id).cloned()) {
        return Some(member);
    }
    ctx.http.get_member(guild_id, user_id).await.ok()
}

pub async fn has_user_reacted(
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

/// Helper to load required context, channels, and compile template structures
pub async fn build_starboard_message(
    ctx: &Context,
    starboard: &Starboard,
    reaction: &Reaction,
    member: &Member,
    emoji_count: u64,
    starboard_channel: ChannelId,
) -> Result<Option<(String, CreateEmbed, Message)>, Error> {
    let Some(guild_id) = reaction.guild_id else { return Ok(None) };
    let Some(guild_starboard_channel) = get_channel(ctx, guild_id, starboard_channel).await else { return Ok(None) };
    let Some(origin_channel) = get_channel(ctx, guild_id, reaction.channel_id).await else { return Ok(None) };

    let origin_message = reaction.message(ctx).await?;
    let gctx = get_guild_ctx(guild_id, ctx).await?;

    let Some(embed_template) = &starboard.embed_template else { return Ok(None) };
    let Some(text_template) = &starboard.plaintext_template else { return Ok(None) };

    let embedded_message = embed_template.to_embed(|text| {
        replace_starboard_placeholders(
            text, &gctx, member, &guild_starboard_channel, &origin_channel, &origin_message, starboard, &emoji_count,
        )
    })?;

    let text_message = replace_starboard_placeholders(
        text_template, &gctx, member, &guild_starboard_channel, &origin_channel, &origin_message, starboard, &emoji_count,
    );

    Ok(Some((text_message, embedded_message, origin_message)))
}

pub async fn get_starboards(guild_id: &str, db: &PgPool) -> Result<Vec<Starboard>, sqlx::Error> {
    let rows = sqlx::query_as::<_, StarboardRow>("SELECT * FROM starboards WHERE guild_id = $1")
        .bind(guild_id)
        .fetch_all(db)
        .await?;

    rows.into_iter()
        .map(Starboard::try_from)
        .collect::<Result<Vec<Starboard>, _>>()
        .map_err(|e| sqlx::Error::Decode(Box::new(e)))
}

pub async fn count_emoji_and_cache(
    ctx: &Context,
    value: Option<u64>,
    msg: &Message,
    removed_reaction: &Reaction,
    starboard: &Starboard,
    redis: &mut MultiplexedConnection,
    cached_key: &str,
) -> Result<u64, RedisError> {
    match value {
        Some(count) => Ok(count),
        None => {
            let mut count = msg
                .reactions
                .iter()
                .find(|r| is_emoji_match(&r.reaction_type, &removed_reaction.emoji))
                .map(|r| r.count)
                .unwrap_or(0);

            if starboard.prevent_self_star.unwrap_or(false) {
                let has_author_reacted = has_user_reacted(ctx, removed_reaction.channel_id, removed_reaction.message_id, &removed_reaction.emoji, msg.author.id).await.unwrap_or(false);
                if has_author_reacted && count > 0 {
                    count -= 1;
                }
            }

            let _: () = redis.set_ex(cached_key, count, 3600).await?;
            Ok(count)
        }
    }
}