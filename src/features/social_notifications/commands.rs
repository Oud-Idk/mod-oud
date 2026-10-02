#![allow(missing_docs, clippy::unused_async)]

use crate::core::config::state::{Context, Error};
use crate::features::social_notifications::subscription::subscribe_feed;
use crate::features::social_notifications::types::FeedKind;
use anyhow::Context as _;
use poise::command;
use serenity::all::ChannelId;

#[command(slash_command, guild_only, subcommands("rss"))]
pub async fn subscribe(_: Context<'_>) -> Result<(), Error> {
    Ok(())
}

/// Subscribe to an RSS feed.
#[command(slash_command, guild_only)]
pub async fn rss(
    ctx: Context<'_>,
    #[description = "The RSS/Atom Feed URL"] url: String,
    #[description = "The Channel to Forward It To. Leave Blank for Current Channel"]
    channel: Option<ChannelId>,
) -> Result<(), Error> {
    ctx.defer().await?;
    let guild_id = ctx.guild_id().with_context(|| "Must be run in a guild")?;
    let state = ctx.data();

    let subscription = subscribe_feed(
        &state.core,
        &url,
        channel.unwrap_or_else(|| ctx.channel_id()),
        guild_id,
    )
    .await?;

    let feed_title = subscription.feed_title;

    if subscription.already_subscribed {
        ctx.say(format!(
            "This channel is **already subscribed** to **{feed_title}**!"
        ))
        .await?;
        return Ok(());
    }

    match subscription.kind {
        FeedKind::PubSubHubbub { .. } if subscription.hub_confirmed => {
            ctx.say(format!("Subscribed to **{feed_title}** via **WebSub**."))
                .await?;
        }
        FeedKind::PubSubHubbub { .. } => {
            ctx.say(format!(
                "Subscribed to **{feed_title}**, but the WebSub Hub returned an error. Fallback may be required."
            )).await?;
        }
        FeedKind::Polling { interval_secs, .. } => {
            ctx.say(format!(
                "Subscribed to **{feed_title}** via **Polling** every {} minutes",
                interval_secs / 60
            ))
            .await?;
        }
    }

    Ok(())
}
