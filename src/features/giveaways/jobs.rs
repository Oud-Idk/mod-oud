use crate::features::giveaways::database::{fetch_expired_giveaways, mark_giveaway_finished};
use crate::features::giveaways::types::Giveaway;
use rand::prelude::IndexedRandom;
use serenity::all::{ChannelId, Http, MessageId, ReactionType, User, UserId};
use sqlx::PgPool;
use std::sync::Arc;
use std::time::Duration;
use tracing::{error, info, trace, warn};

pub async fn get_all_reaction_users(
    http: &Http,
    channel_id: ChannelId,
    message_id: MessageId,
    reaction: &ReactionType,
) -> Result<Vec<User>, serenity::Error> {
    let mut all_users = Vec::new();
    let mut last_user_id: Option<UserId> = None;

    loop {
        let batch = http
            .get_reaction_users(channel_id, message_id, reaction, 100, last_user_id.map(UserId::get))
            .await?;

        if batch.is_empty() {
            break;
        }

        let is_last_batch = batch.len() < 100;
        last_user_id = batch.last().map(|u| u.id);
        all_users.extend(batch);

        if is_last_batch {
            break;
        }
    }

    Ok(all_users)
}

/// Spawns the background task loop that periodically checks for expired giveaways.
pub fn start_giveaway_worker(pool: PgPool, http: Arc<Http>) {
    tokio::spawn(async move {
        info!("Giveaway background worker started!");
        let mut interval = tokio::time::interval(Duration::from_secs(10));

        loop {
            interval.tick().await;

            if let Err(e) = process_expired_giveaways(&pool, &http).await {
                error!("Error processing expired giveaways: {:?}", e);
            }
        }
    });
}

/// Fetches and ends all pending giveaways that have reached their end time
async fn process_expired_giveaways(
    pool: &PgPool,
    http: &Http,
) -> Result<(), Box<dyn std::error::Error>> {
    let expired_giveaways = fetch_expired_giveaways(pool).await?;

    if expired_giveaways.is_empty() {
        trace!("No giveaways have expired yet");
        return Ok(());
    }

    info!(
        "Found {} expired giveaway(s) to resolve.",
        expired_giveaways.len()
    );

    for giveaway in expired_giveaways {
        if let Err(e) = mark_giveaway_finished(pool, giveaway.id).await {
            error!(
                id = giveaway.id,
                "Failed to mark giveaway as finished in DB: {:?}", e
            );
            continue;
        }

        if let Err(e) = end_giveaway(http, &giveaway).await {
            error!(
                id = giveaway.id,
                "Failed to end giveaway on Discord: {:?}", e
            );
        }
    }

    Ok(())
}

/// Fetches reactions from Discord, picks random winners, and announces them
async fn end_giveaway(http: &Http, giveaway: &Giveaway) -> Result<(), Box<dyn std::error::Error>> {
    let channel_id = giveaway
        .channel_id
        .map(|cid| ChannelId::new(cid.cast_unsigned()))
        .ok_or("Giveaway has no channel_id assigned")?;

    let message_id = giveaway
        .message_id
        .map(|mid| MessageId::new(mid.cast_unsigned()))
        .ok_or("Giveaway has no message_id assigned")?;

    let reaction = ReactionType::Unicode("🎉".to_string());

    let users = get_all_reaction_users(http, channel_id, message_id, &reaction).await?;

    let host_id = giveaway.host_id.cast_unsigned();
    let eligible_users: Vec<UserId> = users
        .into_iter()
        .filter(|user| !user.bot && user.id.get() != host_id)
        .map(|user| user.id)
        .collect();

    let winner_count = usize::try_from(giveaway.winner_count)
        .inspect_err(|e| warn!(error = ?e, "Cannot convert winner_count to usize!"))
        .unwrap_or(1);

    let winners: Vec<UserId> = eligible_users
        .sample(&mut rand::rng(), winner_count)
        .copied()
        .collect();

    if winners.is_empty() {
        let no_winners_msg = format!(
            "The giveaway for **{}** has ended! Unfortunately, no eligible entries were found :(",
            giveaway.prize
        );
        channel_id.say(http, no_winners_msg).await?;
        info!(id = giveaway.id, "Giveaway ended with 0 winners.");
    } else {
        let winner_mentions: Vec<String> = winners.iter().map(|u| format!("<@{u}>")).collect();
        let announcement = format!(
            "**GIVEAWAY ENDED** \n\nCongratulations to {}! You won **{}**! 🎁",
            winner_mentions.join(", "),
            giveaway.prize
        );

        channel_id.say(http, announcement).await?;
        info!(id = giveaway.id, winners = ?winners, "Giveaway successfully resolved!");
    }

    Ok(())
}
