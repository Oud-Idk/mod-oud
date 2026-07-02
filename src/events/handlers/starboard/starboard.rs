use crate::events::handlers::starboard::cache::{acquire_starboard_lock, apply_starboard_op_if_exists, release_starboard_lock};
use crate::events::handlers::starboard::{database, permissions, utils};
use crate::types::config::starboard::Starboard;
use crate::types::{Data, Error};
use fred::prelude::*;
use serenity::all::{ChannelId, Context, CreateEmbed, CreateMessage, EditMessage, Member, Message, MessageId, Reaction};
use sqlx::PgPool;
use tracing::{debug, error, info, instrument, trace, warn, Instrument};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum StarboardOp {
    Add,
    Remove,
}

#[instrument(skip(ctx, data, add_reaction), fields(reaction = ?add_reaction.emoji))]
pub async fn handle_starboard_reaction_add(ctx: &Context, add_reaction: &Reaction, data: &Data) -> Result<(), Error> {
    debug!("Handling reaction add event");
    handle_starboard_reaction(ctx, add_reaction, data, StarboardOp::Add).await
}

#[instrument(skip(ctx, data, removed_reaction), fields(reaction = ?removed_reaction.emoji))]
pub async fn handle_starboard_reaction_remove(ctx: &Context, removed_reaction: &Reaction, data: &Data) -> Result<(), Error> {
    debug!("Handling reaction remove event");
    handle_starboard_reaction(ctx, removed_reaction, data, StarboardOp::Remove).await
}

#[instrument(skip(ctx, data, reaction), fields(op = ?op))]
async fn handle_starboard_reaction(
    ctx: &Context,
    reaction: &Reaction,
    data: &Data,
    op: StarboardOp,
) -> Result<(), Error> {
    let db = &data.db;
    let redis = &data.redis; // Type is fred::clients::Client

    let Some(guild_id) = reaction.guild_id else {
        trace!("Reaction has no guild_id, ignoring");
        return Ok(())
    };
    let Some(user_id) = reaction.user_id else {
        trace!("Reaction has no user_id, ignoring");
        return Ok(())
    };
    let guild_id_str = guild_id.to_string();

    let starboards = utils::get_starboards(&guild_id_str, db, redis).await?;
    if starboards.is_empty() {
        trace!("No starboards configured for guild {}", guild_id);
        return Ok(());
    }

    let Some(member) = utils::resolve_member(ctx, guild_id, user_id, reaction).await else {
        warn!(guild_id = %guild_id, user_id = %user_id, "Could not resolve reacting member");
        return Ok(())
    };

    debug!("Fetching original message...");
    let message = reaction.message(&ctx.http).await?;

    for starboard in starboards {
        let span = tracing::info_span!("processing_starboard", starboard_id = starboard.id);
        let _enter = span.enter();

        if !permissions::is_event_allowed(&starboard, reaction, &message, &member, user_id) {
            trace!("Event not allowed under starboard permissions");
            continue;
        }

        let Some(emojis) = &starboard.emojis else { continue };
        let emoji_string = reaction.emoji.to_string();
        if !emojis.contains(&emoji_string) {
            trace!(emoji = %emoji_string, "Emoji does not match starboard configured emojis");
            continue;
        }

        let cached_key = format!(
            "starboard:guild:{}:{}:{}:{}",
            guild_id,
            reaction.message_id.get(),
            starboard.id,
            emoji_string
        );

        debug!(key = %cached_key, "Attempting redis operation");
        let maybe_count = apply_starboard_op_if_exists(redis, &cached_key, op).await?;

        let emoji_count = utils::count_emoji_and_cache(ctx, maybe_count, &message, reaction, &starboard, redis, &cached_key).await?;
        debug!(count = emoji_count, "Determined current emoji count");

        let lock_key = format!("lock:starboard:{}:{}", guild_id, reaction.message_id.get());
        let lock_value = format!("worker-{}", chrono::Utc::now().timestamp_millis());

        debug!(lock_key = %lock_key, "Attempting to acquire lock");
        let lock_acquired = acquire_starboard_lock(redis, &lock_key, &lock_value).await?;

        if lock_acquired.is_some() {
            info!("Lock acquired, spawning async updates loop");
            let ctx_clone = ctx.clone();
            let db_clone = data.db.clone();
            let redis_clone = redis.clone(); // Incredibly cheap clone on fred clients!
            let starboard_clone = starboard.clone();
            let reaction_clone = reaction.clone();
            let member_clone = member.clone();
            let cached_key_clone = cached_key.clone();
            let lock_key_clone = lock_key.clone();
            let lock_value_clone = lock_value.clone();

            let worker_span = tracing::info_span!(
                "starboard_worker_loop",
                lock_key = %lock_key_clone,
                starboard_id = starboard_clone.id,
                msg_id = %reaction_clone.message_id
            );

            tokio::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_millis(1500)).await;

                let mut current_processed = emoji_count;
                let mut loop_count = 0;

                loop {
                    let final_count: u64 = redis_clone.get(&cached_key_clone)
                        .await
                        .unwrap_or(None)
                        .unwrap_or(current_processed);

                    debug!(final_count = final_count, loop_count = loop_count, "Updating starboard in worker loop");

                    if let Err(e) = upsert_starboard(
                        &ctx_clone,
                        &db_clone,
                        &starboard_clone,
                        &reaction_clone,
                        &member_clone,
                        final_count
                    ).await {
                        error!(error = %e, "Error occurred during background starboard upsert");
                    }

                    current_processed = final_count;
                    loop_count += 1;

                    let latest_count: u64 = redis_clone.get(&cached_key_clone)
                        .await
                        .unwrap_or(None)
                        .unwrap_or(final_count);

                    if latest_count == final_count || loop_count >= 5 {
                        debug!(latest_count = latest_count, loop_count = loop_count, "Starboard loop finished condition met");
                        break;
                    }

                    tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                }

                debug!("Releasing lock");
                let release_res = release_starboard_lock(&redis_clone, &lock_key_clone, &lock_value_clone).await;

                match release_res {
                    Ok(1) => debug!("Lock successfully released"),
                    Ok(other) => warn!(status = other, "Failed to release lock, might have expired or been overwritten"),
                    Err(e) => error!(error = %e, "Error executing lock release script"),
                }
            }.instrument(worker_span));
        } else {
            debug!("Lock busy, skipping spawn");
        }
    }

    Ok(())
}

#[instrument(skip(ctx, db, starboard, reaction, member), fields(starboard_id = starboard.id, orig_msg_id = %reaction.message_id, emoji_count = emoji_count
))]
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

    debug!(threshold = threshold, "Upsert check started");
    let starboard_msg_id = database::fetch_starboard_message_id(db, orig_msg_id, starboard.id).await?;

    if emoji_count < threshold && starboard_msg_id.is_none() {
        debug!("Count is below threshold, and no post exists yet. Skipping.");
        return Ok(());
    }

    if emoji_count < threshold {
        if let Some(post_id) = starboard_msg_id {
            info!(post_id = %post_id, "Count fell below threshold; demoting/deleting post");
            database::handle_starboard_demotion(ctx, db, starboard_channel, post_id, orig_msg_id, starboard.id).await?;
        }
        return Ok(());
    }

    debug!("Building starboard message formatting");
    let Some((text_message, embedded_message, origin_message)) =
        utils::build_starboard_message(ctx, starboard, reaction, member, emoji_count, starboard_channel).await?
    else {
        warn!("Could not build starboard message components");
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

#[instrument(
    skip(ctx, db, starboard, reaction, text_message, embedded_message, origin_message),
    fields(starboard_id = starboard.id, orig_msg_id = %reaction.message_id, is_edit = starboard_msg_id.is_some()
    )
)]
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
            info!(channel_id = %starboard_channel, post_id = %post_id, "Editing existing starboard message");
            let builder = EditMessage::new()
                .content(text_message)
                .embed(embedded_message);

            starboard_channel.edit_message(&ctx.http, post_id, builder).await?;
            database::update_starred_message_count(db, orig_msg_id, starboard.id, emoji_count).await?;
        }
        None => {
            info!(channel_id = %starboard_channel, "Creating brand new starboard message");
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