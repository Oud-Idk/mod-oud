use crate::core::config::get_guild_ctx;
use crate::types::config::starboard::{Starboard, StarboardRow};
use crate::types::Error;
use crate::utils::placeholders::replace_starboard_placeholders;
use fred::bytes_utils::Str;
use fred::interfaces::KeysInterface;
use fred::prelude::{Client, Expiration, FredResult};
use serenity::all::{Channel, ChannelId, Context, CreateEmbed, GuildChannel, GuildId, Member, Message, MessageId, Reaction, ReactionType, UserId};
use sqlx::PgPool;
use tracing::{debug, instrument, trace, warn};

pub async fn get_channel(ctx: &Context, guild_id: GuildId, channel_id: ChannelId) -> Option<GuildChannel> {
    let cached_channel = ctx.cache.guild(guild_id)
        .and_then(|g| g.channels.get(&channel_id).cloned());

    if let Some(channel) = cached_channel {
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

#[instrument(skip(ctx, starboard, reaction, member), fields(starboard_id = starboard.id))]
pub async fn build_starboard_message(
    ctx: &Context,
    starboard: &Starboard,
    reaction: &Reaction,
    member: &Member,
    emoji_count: u64,
    starboard_channel: ChannelId,
) -> Result<Option<(String, CreateEmbed, Message)>, Error> {
    debug!("Building message structures from templates");
    let Some(guild_id) = reaction.guild_id else { return Ok(None) };
    let Some(guild_starboard_channel) = get_channel(ctx, guild_id, starboard_channel).await else { return Ok(None) };
    let Some(origin_channel) = get_channel(ctx, guild_id, reaction.channel_id).await else { return Ok(None) };

    let origin_message = reaction.message(ctx).await?;
    let gctx = get_guild_ctx(guild_id, ctx).await?;

    let Some(embed_template) = &starboard.embed_template else {
        warn!("Missing embed template for starboard config");
        return Ok(None)
    };
    let Some(text_template) = &starboard.plaintext_template else {
        warn!("Missing text template for starboard config");
        return Ok(None)
    };

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

#[instrument(skip(db, redis))]
pub async fn get_starboards(
    guild_id: &str,
    db: &PgPool,
    redis: &Client,
) -> Result<Vec<Starboard>, Error> {
    let cache_key = format!("starboard:config:{}", guild_id);
    trace!(cache_key = %cache_key, "Fetching starboards config");

    let maybe_starboard_config: FredResult<Option<String>> = redis.get(&cache_key).await;

    if let Ok(Some(cached_data)) = maybe_starboard_config {
        if let Ok(configs) = serde_json::from_str::<Vec<Starboard>>(&cached_data) {
            trace!("Cache hit for starboard configs");
            return Ok(configs);
        }
    }

    debug!("Cache miss; fetching starboard configs from database");
    let rows = sqlx::query_as::<_, StarboardRow>("SELECT * FROM starboards WHERE guild_id = $1")
        .bind(guild_id)
        .fetch_all(db)
        .await?;

    let starboards = rows.into_iter()
        .map(Starboard::try_from)
        .collect::<Result<Vec<Starboard>, _>>()
        .map_err(|e| sqlx::Error::Decode(Box::new(e)))?;

    if let Ok(serialized) = serde_json::to_string(&starboards) {
        trace!("Caching starboard configs back to Redis");
        let _: Result<(), _> = redis.set(&cache_key, serialized, Some(Expiration::EX(86400)), None, false).await;
    }

    Ok(starboards)
}

#[instrument(
    skip(ctx, msg, removed_reaction, starboard, redis),
    fields(starboard_id = starboard.id)
)]
pub async fn count_emoji_and_cache(
    ctx: &Context,
    value: Option<u64>,
    msg: &Message,
    removed_reaction: &Reaction,
    starboard: &Starboard,
    redis: &Client,
    cached_key: &str,
) -> FredResult<u64> {
    match value {
        Some(count) => {
            trace!(count = count, "Count provided by Redis script, utilizing cache value");
            Ok(count)
        }
        None => {
            debug!("Count not provided by Redis; recalculating manually from message reactions");
            let mut count = msg
                .reactions
                .iter()
                .find(|r| is_emoji_match(&r.reaction_type, &removed_reaction.emoji))
                .map(|r| r.count)
                .unwrap_or(0);

            if starboard.prevent_self_star.unwrap_or(false) {
                trace!("Self-star prevention active; checking reaction authors");
                let has_author_reacted = has_user_reacted(ctx, removed_reaction.channel_id, removed_reaction.message_id, &removed_reaction.emoji, msg.author.id).await.unwrap_or(false);
                if has_author_reacted && count > 0 {
                    debug!("Self-star detected; decrementing official reaction count");
                    count -= 1;
                }
            }

            trace!(key = %cached_key, count = count, "Updating Redis emoji cache");
            let _: () = redis.set(cached_key, count, Some(Expiration::EX(3600)), None, false).await?;
            Ok(count)
        }
    }
}