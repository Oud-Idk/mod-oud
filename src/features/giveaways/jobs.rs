use std::sync::Arc;
use std::time::Duration;
use rand::prelude::IndexedRandom;
use serenity::all::{ChannelId, Http, MessageId, ReactionType, UserId};
use sqlx::PgPool;
use tracing::{error, info, trace};
use crate::features::giveaways::database::{fetch_expired_giveaways, mark_giveaway_finished};
use crate::features::giveaways::types::Giveaway;

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
async fn process_expired_giveaways(pool: &PgPool, http: &Http) -> Result<(), Box<dyn std::error::Error>> {
    let expired_giveaways = fetch_expired_giveaways(pool).await?;

    if expired_giveaways.is_empty() {
        trace!("No giveaways have expired yet");
        return Ok(());
    }

    info!("Found {} expired giveaway(s) to resolve.", expired_giveaways.len());

    for giveaway in expired_giveaways {
        if let Err(e) = mark_giveaway_finished(pool, giveaway.id).await {
            error!(id = giveaway.id, "Failed to mark giveaway as finished in DB: {:?}", e);
            continue;
        }

        if let Err(e) = end_giveaway(http, &giveaway).await {
            error!(id = giveaway.id, "Failed to end giveaway on Discord: {:?}", e);
        }
    }

    Ok(())
}

/// Fetches reactions from Discord, picks random winners, and announces them
async fn end_giveaway(http: &Http, giveaway: &Giveaway) -> Result<(), Box<dyn std::error::Error>> {
    let channel_id = match giveaway.channel_id {
        Some(cid) => ChannelId::new(cid as u64),
        None => return Err("Giveaway has no channel_id assigned".into()),
    };

    let message_id = match giveaway.message_id {
        Some(mid) => MessageId::new(mid as u64),
        None => return Err("Giveaway has no message_id assigned".into()),
    };

    let reaction = ReactionType::Unicode("🎉".to_string());

    let users = http
        .get_reaction_users(channel_id, message_id, &reaction, 100, None)
        .await?;

    let eligible_users: Vec<UserId> = users
        .into_iter()
        .filter(|user| !user.bot && user.id.get() != giveaway.host_id as u64)
        .map(|user| user.id)
        .collect();

    let winner_count = giveaway.winner_count as usize;

    let winners: Vec<UserId> = eligible_users
        .sample(&mut rand::rng(), winner_count)
        .cloned()
        .collect();

    if winners.is_empty() {
        let no_winners_msg = format!(
            "The giveaway for **{}** has ended! Unfortunately, no eligible entries were found :(",
            giveaway.prize
        );
        channel_id.say(http, no_winners_msg).await?;
        info!(id = giveaway.id, "Giveaway ended with 0 winners.");
    } else {
        let winner_mentions: Vec<String> = winners.iter().map(|u| format!("<@{}>", u)).collect();
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