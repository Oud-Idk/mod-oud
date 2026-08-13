use crate::core::config::state::BotData;
use crate::features::starboard::builder::{build_starboard_message, count_emoji_and_cache};
use crate::features::starboard::cache::{apply_starboard_op_if_exists, get_starboards};
use crate::features::starboard::types::{Starboard, StarboardOp};
use crate::features::starboard::{builder, database, perms};
use crate::shared::locking::acquire_lock;
use anyhow::Result;
use fred::prelude::*;
use serenity::all::{ChannelId, Context, CreateEmbed, CreateMessage, EditMessage, Member, Message, MessageId, Reaction};
use sqlx::PgPool;
use tracing::{Instrument, debug, error, info, instrument, trace, warn};

#[instrument(skip(ctx, db, orig_msg_id), fields(orig_msg_id = orig_msg_id.get()))]
pub async fn handle_cleanup_if_starboard(
    ctx: &Context,
    db: &PgPool,
    orig_msg_id: &MessageId,
) -> Result<()> {
    let id = orig_msg_id.get() as i64;
    debug!("Starting starboard cleanup check for original message");

    let rows = database::fetch_starboard(db, id).await?;
    debug!(rows_found = rows.len(), "Fetched linked starboard messages");

    for row in rows {
        if row.keep_deleted_messages.unwrap_or(false) {
            debug!(
                channel_id = row.starboard_channel_id,
                "Skipping Discord message deletion because 'keep_deleted_messages' is enabled"
            );
            continue;
        }

        let channel_id = ChannelId::new(row.starboard_channel_id as u64);

        if let Some(msg_id_val) = row.starboard_message_id.map(|id| id as u64) {
            let msg_id = MessageId::new(msg_id_val);
            debug!(channel_id = %channel_id, msg_id = %msg_id, "Attempting to delete message from starboard channel");
            if let Err(e) = channel_id.delete_message(&ctx.http, msg_id).await {
                warn!(error = %e, channel_id = %channel_id, msg_id = %msg_id, "Could not delete message from Discord");
            }
        }
    }

    debug!("Deleting message mappings from database");
    database::delete_starboard(db, id).await?;

    info!("Cleanup successfully completed");
    Ok(())
}

#[instrument(skip(ctx, data, add_reaction), fields(reaction = ?add_reaction.emoji))]
pub async fn handle_reaction_add(ctx: &Context, add_reaction: &Reaction, data: &BotData) -> Result<()> {
    debug!("Handling reaction add event");
    handle_starboard_reaction(ctx, add_reaction, data, StarboardOp::Add).await
}

#[instrument(skip(ctx, data, removed_reaction), fields(reaction = ?removed_reaction.emoji))]
pub async fn handle_reaction_remove(ctx: &Context, removed_reaction: &Reaction, data: &BotData) -> Result<()> {
    debug!("Handling reaction remove event");
    handle_starboard_reaction(ctx, removed_reaction, data, StarboardOp::Remove).await
}

#[instrument(skip(ctx, data, reaction), fields(op = ?op))]
async fn handle_starboard_reaction(
    ctx: &Context,
    reaction: &Reaction,
    data: &BotData,
    op: StarboardOp,
) -> Result<()> {
    let db = &data.core.db;
    let redis = &data.core.redis;

    let Some(guild_id) = reaction.guild_id else { return Ok(()) };
    let Some(user_id) = reaction.user_id else { return Ok(()) };

    let starboards = get_starboards(guild_id.get() as i64, db, redis).await?;
    if starboards.is_empty() {
        return Ok(());
    }

    let Some(member) = builder::resolve_member(ctx, guild_id, user_id, reaction).await else {
        warn!(guild_id = %guild_id, user_id = %user_id, "Could not resolve reacting member");
        return Ok(());
    };

    debug!("Fetching original message...");
    let message = reaction.message(&ctx.http).await?;

    for starboard in starboards {
        let span = tracing::info_span!("processing_starboard", starboard_id = starboard.id);
        let _enter = span.enter();

        if !perms::is_event_allowed(&starboard, reaction, &message, &member, user_id) {
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

        let emoji_count = count_emoji_and_cache(ctx, maybe_count, &message, reaction, &starboard, redis, &cached_key).await?;
        debug!(count = emoji_count, "Determined current emoji count");

        let lock_key = format!("lock:starboard:{}:{}", guild_id, reaction.message_id.get());
        let lock_value = format!("worker-{}", chrono::Utc::now().timestamp_millis());

        debug!(lock_key = %lock_key, "Attempting to acquire lock");
        let maybe_lock = acquire_lock(redis, &lock_key, &lock_value, 5).await?;

        if let Some(guard) = maybe_lock {
            info!("Lock acquired, spawning async updates loop");
            let ctx_clone = ctx.clone();
            let db_clone = data.core.db.clone();
            let redis_clone = redis.clone();
            let starboard_clone = starboard.clone();
            let reaction_clone = reaction.clone();
            let member_clone = member.clone();
            let cached_key_clone = cached_key.clone();

            let worker_span = tracing::info_span!(
                "starboard_worker_loop",
                starboard_id = starboard_clone.id,
                msg_id = %reaction_clone.message_id
            );

            tokio::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_millis(1500)).await;

                let mut current_processed = emoji_count;
                let mut loop_count = 0;

                loop {
                    let final_count: u64 = redis_clone
                        .get(&cached_key_clone)
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
                        final_count,
                    )
                        .await
                    {
                        error!(error = %e, "Error occurred during background starboard upsert");
                    }

                    current_processed = final_count;
                    loop_count += 1;

                    let latest_count: u64 = redis_clone
                        .get(&cached_key_clone)
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
                let _ = guard.release().await;
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
) -> Result<()> {
    let Some(_guild_id) = reaction.guild_id else { return Ok(()) };
    let starboard_channel = ChannelId::new(starboard.starboard_channel_id as u64);
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
        build_starboard_message(ctx, starboard, reaction, member, emoji_count, starboard_channel).await?
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
) -> Result<()> {
    let Some(guild_id) = reaction.guild_id else { return Ok(()) };
    let starboard_channel = ChannelId::new(starboard.starboard_channel_id as u64);
    let orig_msg_id = reaction.message_id;

    if let Some(post_id) = starboard_msg_id {
        info!(channel_id = %starboard_channel, post_id = %post_id, "Editing existing starboard message");
        let builder = EditMessage::new().content(text_message).embed(embedded_message);

        starboard_channel.edit_message(&ctx.http, post_id, builder).await?;
        database::update_starred_message_count(db, orig_msg_id, starboard.id, emoji_count).await?;
    } else {
        info!(channel_id = %starboard_channel, "Creating brand new starboard message");
        let builder = CreateMessage::new().content(text_message).embed(embedded_message);

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

    Ok(())
}