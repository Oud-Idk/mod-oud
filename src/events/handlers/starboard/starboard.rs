use crate::events::handlers::starboard::{database, permissions, utils};
use crate::types::config::starboard::Starboard;
use crate::types::{Data, Error};
use redis::AsyncCommands;
use serenity::all::{ChannelId, Context, CreateEmbed, CreateMessage, EditMessage, Member, Message, MessageId, Reaction};
use sqlx::PgPool;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum StarboardOp {
    Add,
    Remove,
}

pub async fn handle_starboard_reaction_add(ctx: &Context, add_reaction: &Reaction, data: &Data) -> Result<(), Error> {
    handle_starboard_reaction(ctx, add_reaction, data, StarboardOp::Add).await
}

pub async fn handle_starboard_reaction_remove(ctx: &Context, removed_reaction: &Reaction, data: &Data) -> Result<(), Error> {
    handle_starboard_reaction(ctx, removed_reaction, data, StarboardOp::Remove).await
}

async fn handle_starboard_reaction(
    ctx: &Context,
    reaction: &Reaction,
    data: &Data,
    op: StarboardOp,
) -> Result<(), Error> {
    let db = &data.db;
    let mut redis = data.redis.clone();

    let Some(guild_id) = reaction.guild_id else { return Ok(()) };
    let Some(user_id) = reaction.user_id else { return Ok(()) };
    let guild_id_str = guild_id.to_string();

    let starboards = utils::get_starboards(&guild_id_str, db).await?;
    if starboards.is_empty() { return Ok(()); }

    let Some(member) = utils::resolve_member(ctx, guild_id, user_id, reaction).await else { return Ok(()) };
    let message = reaction.message(&ctx.http).await?;

    for starboard in starboards {
        if !permissions::is_event_allowed(&starboard, reaction, &message, &member, user_id, &mut redis).await? {
            continue;
        }

        let Some(emojis) = &starboard.emojis else { continue };
        let emoji_string = reaction.emoji.to_string();
        if !emojis.contains(&emoji_string) {
            continue;
        }

        let cached_key = format!(
            "starboard:guild:{}:{}:{}:{}",
            guild_id,
            reaction.message_id.get(),
            starboard.id,
            emoji_string
        );

        // Unified atomic script: we pass "INCR" or "DECR" as ARGV[1]
        let opt_script = redis::Script::new(r#"
            if redis.call("EXISTS", KEYS[1]) == 1 then
                return redis.call(ARGV[1], KEYS[1])
            else
                return nil
            end
        "#);

        let redis_cmd = match op {
            StarboardOp::Add => "INCR",
            StarboardOp::Remove => "DECR",
        };

        let maybe_count: Option<u64> = opt_script
            .key(&cached_key)
            .arg(redis_cmd)
            .invoke_async(&mut redis)
            .await?;

        let emoji_count = utils::count_emoji_and_cache(ctx, maybe_count, &message, reaction, &starboard, &mut redis, &cached_key).await?;

        let lock_key = format!("lock:starboard:{}:{}", guild_id, reaction.message_id.get());
        let lock_value = format!("worker-{}", chrono::Utc::now().timestamp_millis());

        let lock_acquired: Option<String> = redis::cmd("SET")
            .arg(&lock_key)
            .arg(&lock_value)
            .arg("NX")
            .arg("EX")
            .arg(15)
            .query_async(&mut redis)
            .await?;

        if lock_acquired.is_some() {
            let ctx_clone = ctx.clone();
            let db_clone = data.db.clone();
            let mut redis_clone = redis.clone();
            let starboard_clone = starboard.clone();
            let reaction_clone = reaction.clone();
            let member_clone = member.clone();
            let cached_key_clone = cached_key.clone();

            tokio::spawn(async move {
                // Debounce Window: Sleep for 1.5s to let other concurrent reactions accumulate in Redis
                tokio::time::sleep(std::time::Duration::from_millis(1500)).await;

                // Fetch the LATEST, fully consolidated star count from Redis
                let final_count: u64 = redis_clone.get(&cached_key_clone).await.unwrap_or(emoji_count);

                let _ = upsert_starboard(
                    &ctx_clone,
                    &db_clone,
                    &starboard_clone,
                    &reaction_clone,
                    &member_clone,
                    final_count
                ).await;

                // Release the lock atomically using our safe Lua script
                let release_script = redis::Script::new(r#"
                    if redis.call("get", KEYS[1]) == ARGV[1] then
                        return redis.call("del", KEYS[1])
                    else
                        return 0
                    end
                "#);
                let _: Result<(), _> = release_script
                    .key(&lock_key)
                    .arg(&lock_value)
                    .invoke_async(&mut redis_clone)
                    .await;
            });
        } else {
            // Another node has already locked this message and will handle the updates.
        }
    }

    Ok(())
}


/// Main orchestration function
pub async fn upsert_starboard(
    ctx: &Context,
    db: &PgPool,
    starboard: &Starboard,
    reaction: &Reaction,
    member: &Member,
    emoji_count: u64,
) -> Result<(), Error> {
    let Some(_guild_id) = reaction.guild_id else { return Ok(()) };
    let starboard_channel = ChannelId::new(starboard.starboard_channel_id);
    let threshold = starboard.reaction_threshold.unwrap_or(10) as u64;
    let orig_msg_id = reaction.message_id;

    let starboard_msg_id = database::fetch_starboard_message_id(db, orig_msg_id, starboard.id).await?;

    // Scenario A: Below threshold & doesn't exist yet -> DO NOTHING.
    if emoji_count < threshold && starboard_msg_id.is_none() {
        return Ok(());
    }

    // Scenario B: Below threshold but post exists -> Demote (Delete from Discord & DB)
    if emoji_count < threshold {
        if let Some(post_id) = starboard_msg_id {
            database::handle_starboard_demotion(ctx, db, starboard_channel, post_id, orig_msg_id, starboard.id).await?;
        }
        return Ok(());
    }

    // Scenario C: Meets threshold -> Create or edit the post.
    let Some((text_message, embedded_message, origin_message)) =
        utils::build_starboard_message(ctx, starboard, reaction, member, emoji_count, starboard_channel).await?
    else {
        return Ok(());
    };

    create_or_update_post(
        ctx,
        db,
        starboard,
        reaction,
        starboard_msg_id,
        text_message,
        embedded_message,
        &origin_message,
        emoji_count,
    )
        .await?;

    Ok(())
}

async fn create_or_update_post(
    ctx: &Context,
    db: &PgPool,
    starboard: &Starboard,
    reaction: &Reaction,
    starboard_msg_id: Option<MessageId>,
    text_message: String,
    embedded_message: CreateEmbed,
    origin_message: &Message,
    emoji_count: u64,
) -> Result<(), Error> {
    let Some(guild_id) = reaction.guild_id else { return Ok(()) };
    let starboard_channel = ChannelId::new(starboard.starboard_channel_id);
    let orig_msg_id = reaction.message_id;

    match starboard_msg_id {
        Some(post_id) => {
            let builder = EditMessage::new()
                .content(text_message)
                .embed(embedded_message);

            starboard_channel.edit_message(&ctx.http, post_id, builder).await?;

            database::update_starred_message_count(db, orig_msg_id, starboard.id, emoji_count).await?;
        }
        None => {
            let builder = CreateMessage::new()
                .content(text_message)
                .embed(embedded_message);

            let sent_msg = starboard_channel.send_message(&ctx.http, builder).await?;

            database::insert_starred_message(
                db,
                orig_msg_id,
                sent_msg.id,
                starboard.id,
                guild_id,
                reaction.channel_id,
                origin_message.author.id,
                emoji_count,
            )
                .await?;
        }
    }

    Ok(())
}

