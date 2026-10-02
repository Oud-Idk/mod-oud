use crate::core::config::state::BotData;
use crate::features::starboard::builder::build_starboard_message;
use crate::features::starboard::cache::get_starboard_count;
use crate::features::starboard::database;
use crate::features::starboard::database::StarboardPayload;
use crate::features::starboard::types::Starboard;
use crate::shared::locking::acquire_lock;
use crate::shared::task;
use anyhow::Result;
use serenity::all::{
    Context, CreateEmbed, CreateMessage, EditMessage, Member, Message, MessageId, Reaction,
};
use sqlx::PgPool;
use std::convert::TryFrom;
use tracing::{Instrument, debug, error, info, instrument, warn};

pub async fn debounced_starboard_sync(
    ctx: &Context,
    data: &BotData,
    starboard: &Starboard,
    reaction: &Reaction,
    cached_key: &str,
    emoji_count: u64,
) -> Result<(), fred::error::Error> {
    let Some(guild_id) = reaction.guild_id else {
        return Ok(());
    };
    let redis = &data.core.redis;
    let lock_key = format!("lock:starboard:{}:{}", guild_id, reaction.message_id.get());
    let lock_value = format!("worker-{}", chrono::Utc::now().timestamp_millis());

    let maybe_lock = acquire_lock(redis, &lock_key, &lock_value, 5).await?;
    if let Some(guard) = maybe_lock {
        let ctx_clone = ctx.clone();
        let db_clone = data.core.db.clone();
        let redis_clone = redis.clone();
        let starboard_clone = starboard.clone();
        let reaction_clone = reaction.clone();
        let cached_key_clone = cached_key.to_string();

        // The job span carries the name and the exit line; this one carries which starboard, so
        // the per-iteration lines below stay attributable.
        let ids_span = tracing::info_span!(
            "starboard",
            starboard_id = starboard_clone.id,
            msg_id = %reaction_clone.message_id
        );

        // Quiet: one per reaction, and the loop's own outcome is logged inside it.
        task::spawn_quiet(
            "starboard_worker_loop",
            async move {
                tokio::time::sleep(std::time::Duration::from_millis(1500)).await;

                let mut current_processed = emoji_count;
                let mut loop_count = 0;

                loop {
                    let final_count: u64 = get_starboard_count(&redis_clone, &cached_key_clone)
                        .await
                        .unwrap_or(current_processed);

                    if let Err(e) = upsert_starboard(
                        &ctx_clone,
                        &db_clone,
                        &starboard_clone,
                        &reaction_clone,
                        final_count,
                    )
                    .await
                    {
                        error!(error = %e, "background starboard upsert failed");
                    }

                    current_processed = final_count;
                    loop_count += 1;

                    let latest_count: u64 = get_starboard_count(&redis_clone, &cached_key_clone)
                        .await
                        .unwrap_or(final_count);

                    if latest_count == final_count || loop_count >= 5 {
                        debug!(
                            latest_count = latest_count,
                            loop_count = loop_count,
                            "starboard loop finished condition met"
                        );
                        break;
                    }

                    tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                }

                match guard.release().await {
                    Ok(true) => {}
                    Ok(false) => {
                        warn!(lock_key = %lock_key, "starboard worker lock no longer owned at release");
                    }
                    Err(e) => {
                        warn!(
                            error = ?e,
                            lock_key = %lock_key,
                            "starboard worker lock release failed; it will expire on its own"
                        );
                    }
                }
            }
            .instrument(ids_span),
        );

        debug!(
            starboard_id = starboard.id,
            message_id = %reaction.message_id,
            "starboard worker spawned under the lock"
        );
    } else {
        warn!(lock_key = %lock_key, "lock busy, skipping spawn");
    }

    Ok(())
}

/// Creates or updates the starboard post for a message based on its emoji count
/// and configured threshold, demoting or deleting posts that fall below it.
#[instrument(skip(ctx, db, starboard, reaction, member), fields(starboard_id = starboard.id, orig_msg_id = %reaction.message_id, emoji_count = emoji_count
))]
pub async fn upsert_starboard(
    ctx: &Context,
    db: &PgPool,
    starboard: &Starboard,
    reaction: &Reaction,
    emoji_count: u64,
) -> Result<()> {
    let Some(_guild_id) = reaction.guild_id else {
        return Ok(());
    };
    let starboard_channel = starboard.starboard_channel_id;
    let threshold = u64::try_from(starboard.reaction_threshold)?;
    let orig_msg_id = reaction.message_id;

    let starboard_msg_id =
        database::fetch_starboard_message_id(db, orig_msg_id, starboard.id).await?;

    if emoji_count < threshold && starboard_msg_id.is_none() {
        debug!("count is below threshold and no post exists yet, skipping");
        return Ok(());
    }

    if emoji_count < threshold {
        if let Some(post_id) = starboard_msg_id {
            database::handle_starboard_demotion(
                ctx,
                db,
                starboard_channel,
                post_id,
                orig_msg_id,
                starboard.id,
            )
            .await?;

            info!(
                channel_id = %starboard_channel,
                post_id = %post_id,
                "starboard post demoted after falling below the threshold"
            );
        }
        return Ok(());
    }

    let Some((text_message, embedded_message, origin_message)) =
        build_starboard_message(ctx, starboard, reaction, emoji_count, starboard_channel).await?
    else {
        warn!(
            channel_id = %starboard_channel,
            "starboard message components unavailable"
        );
        return Ok(());
    };

    let payload = BuiltStarboardMessage {
        text: text_message,
        embed: embedded_message,
        origin: origin_message,
    };

    create_or_update_post(
        ctx,
        db,
        starboard,
        reaction,
        starboard_msg_id,
        payload,
        emoji_count,
    )
    .await?;

    Ok(())
}

pub struct BuiltStarboardMessage {
    pub text: String,
    pub embed: CreateEmbed,
    pub origin: Message,
}

#[instrument(
    skip(ctx, db, starboard, reaction, message_data),
    fields(
        starboard_id = starboard.id,
        orig_msg_id = %reaction.message_id,
        is_edit = starboard_msg_id.is_some()
    )
)]
async fn create_or_update_post(
    ctx: &Context,
    db: &PgPool,
    starboard: &Starboard,
    reaction: &Reaction,
    starboard_msg_id: Option<MessageId>,
    message_data: BuiltStarboardMessage,
    emoji_count: u64,
) -> Result<()> {
    let Some(guild_id) = reaction.guild_id else {
        return Ok(());
    };
    let starboard_channel = starboard.starboard_channel_id;
    let orig_msg_id = reaction.message_id;

    if let Some(post_id) = starboard_msg_id {
        let builder = EditMessage::new()
            .content(message_data.text)
            .embed(message_data.embed);

        starboard_channel
            .edit_message(&ctx.http, post_id, builder)
            .await?;

        info!(channel_id = %starboard_channel, post_id = %post_id, "starboard message edited");
        database::update_starred_message_count(db, orig_msg_id, starboard.id, emoji_count).await?;
    } else {
        let builder = CreateMessage::new()
            .content(message_data.text)
            .embed(message_data.embed);

        let sent_msg = starboard_channel.send_message(&ctx.http, builder).await?;

        info!(
            channel_id = %starboard_channel,
            message_id = %sent_msg.id,
            "starboard message created"
        );
        let starboard_payload = StarboardPayload {
            orig_msg_id,
            starboard_msg_id: sent_msg.id,
            starboard_id: starboard.id,
            guild_id,
            channel_id: reaction.channel_id,
            author_id: message_data.origin.author.id,
            emoji_count,
        };

        database::insert_starred_message(db, starboard_payload).await?;
    }

    Ok(())
}
