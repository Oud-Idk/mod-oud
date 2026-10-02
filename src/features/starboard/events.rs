use crate::core::config::state::BotData;
use crate::features::starboard::builder::{build_starboard_message, count_emoji_and_cache};
use crate::features::starboard::cache::{
    apply_starboard_op_if_exists, get_starboard_count, get_starboards,
};
use crate::features::starboard::database::StarboardPayload;
use crate::features::starboard::jobs::debounced_starboard_sync;
use crate::features::starboard::types::{Starboard, StarboardOp};
use crate::features::starboard::{builder, database, perms};
use crate::shared::locking::acquire_lock;
use crate::shared::task;
use anyhow::Result;
use serenity::all::{
    Context, CreateEmbed, CreateMessage, EditMessage, Member, Message, MessageId, Reaction,
};
use sqlx::PgPool;
use tracing::{Instrument, debug, error, info, instrument, warn};

/// Deletes linked starboard messages when the original message is removed,
/// unless the starboard is configured to keep deleted messages.
///
/// # Errors
/// Returns an error if the starboard lookup or cleanup fails against Postgres.
#[instrument(skip(ctx, db, orig_msg_id), fields(orig_msg_id = orig_msg_id.get()))]
pub async fn handle_cleanup_if_starboard(
    ctx: &Context,
    db: &PgPool,
    orig_msg_id: MessageId,
) -> Result<()> {
    let rows = database::fetch_starboard(db, orig_msg_id).await?;
    debug!(rows_found = rows.len(), "fetched linked starboard messages");

    for row in rows {
        if row.keep_deleted_messages.unwrap_or(false) {
            debug!(
                channel_id = %row.starboard_channel_id,
                "skipping Discord message deletion because 'keep_deleted_messages' is enabled"
            );
            continue;
        }

        let channel_id = row.starboard_channel_id;

        if let Some(msg_id) = row.starboard_message_id
            && let Err(e) = channel_id.delete_message(&ctx.http, msg_id).await
        {
            warn!(error = %e, channel_id = %channel_id, msg_id = %msg_id, "message not deleted from the starboard channel");
        }
    }

    database::delete_starboard(db, orig_msg_id).await?;

    info!(%orig_msg_id, "starboard removed");
    Ok(())
}

/// Handles a reaction added event for starboard processing.
///
/// # Errors
/// Returns an error if the starboard processing fails (config lookup, cache, or
/// Discord API).
#[instrument(skip(ctx, data, add_reaction), fields(reaction = ?add_reaction.emoji))]
pub async fn handle_reaction_add(
    ctx: &Context,
    add_reaction: &Reaction,
    data: &BotData,
) -> Result<()> {
    handle_starboard_reaction(ctx, add_reaction, data, StarboardOp::Add).await
}

/// Handles a reaction removed event for starboard processing.
///
/// # Errors
/// Returns an error if the starboard processing fails (config lookup, cache, or
/// Discord API).
#[instrument(skip(ctx, data, removed_reaction), fields(reaction = ?removed_reaction.emoji))]
pub async fn handle_reaction_remove(
    ctx: &Context,
    removed_reaction: &Reaction,
    data: &BotData,
) -> Result<()> {
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

    let Some(guild_id) = reaction.guild_id else {
        return Ok(());
    };
    let Some(user_id) = reaction.user_id else {
        return Ok(());
    };

    let starboards = get_starboards(guild_id.get(), db, redis).await?;
    if starboards.is_empty() {
        return Ok(());
    }

    let Some(member) = builder::resolve_member(ctx, guild_id, user_id, reaction).await else {
        warn!(%guild_id, user_id = %user_id, "reacting member unresolved");
        return Ok(());
    };

    let message = reaction.message(&ctx.http).await?;
    debug!(message_id = %reaction.message_id, "original message fetched");

    for starboard in starboards {
        let span = tracing::info_span!("processing_starboard", starboard_id = starboard.id);
        let _enter = span.enter();

        if !perms::is_event_allowed(&starboard, reaction, &message, &member, user_id) {
            debug!("event not allowed under starboard permissions");
            continue;
        }

        let emojis = &starboard.emojis;
        let emoji_string = reaction.emoji.to_string();
        if !emojis.contains(&emoji_string) {
            debug!(emoji = %emoji_string, "emoji does not match starboard configured emojis");
            continue;
        }

        let cached_key = format!(
            "starboard:guild:{}:{}:{}:{}",
            guild_id,
            reaction.message_id.get(),
            starboard.id,
            emoji_string
        );

        let maybe_count = apply_starboard_op_if_exists(redis, &cached_key, op).await?;

        let emoji_count = count_emoji_and_cache(
            ctx,
            maybe_count,
            &message,
            reaction,
            &starboard,
            redis,
            &cached_key,
        )
        .await?;
        debug!(count = emoji_count, "determined current emoji count");

        debounced_starboard_sync(ctx, data, &starboard, reaction, &cached_key, emoji_count).await?;
    }

    Ok(())
}
