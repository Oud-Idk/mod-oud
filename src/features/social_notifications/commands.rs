#![allow(missing_docs)]

use anyhow::Context as _;
use poise::command;
use serenity::all::ChannelId;
use crate::core::config::state::{Context, Error};
use crate::features::social_notifications::database::{insert_feed, subscribe_channel};
use crate::features::social_notifications::discovery::{derive_feed_secret, discover_feed_kind, request_hub_subscription};
use crate::features::social_notifications::types::FeedKind;

#[command(
    slash_command,
    guild_only,
    subcommands("rss"),
)]
pub async fn subscribe(
    _: Context<'_>,
) -> Result<(), Error> {
    Ok(())
}


/// Subscribe to an RSS feed.
#[command(slash_command, guild_only)]
pub async fn rss(
    ctx: Context<'_>,
    #[description = "The RSS/Atom Feed URL"] url: String,
    #[description = "The Channel to Forward It To. Leave Blank for Current Channel"] channel: Option<ChannelId>,
) -> Result<(), Error> {
    ctx.defer().await?;
    let guild_id = ctx.guild_id().with_context(|| "Must be run in a guild")?;
    let state = ctx.data();

    let resp = state.core.reqwest_client.get(&url).send().await?.error_for_status()?;
    let body = resp.text().await?;

    let feed = feed_rs::parser::parse(body.as_bytes())?;
    let feed_title = feed.title.map_or("Feed".into(), |t| t.content);

    let kind = discover_feed_kind(&url, &body);
    let feed_id = insert_feed(&state.core.db, &url, &kind).await?;
    let is_new = subscribe_channel(&state.core.db, feed_id, channel.unwrap_or(ctx.channel_id()), guild_id).await?;

    if !is_new {
        ctx.say(format!("This channel is **already subscribed** to **{}**!", feed_title)).await?;
        return Ok(());
    }

    let internal_api_secret = state.core.config.internal_api_secret.as_deref().with_context(
        || "Missing internal API secret. Please ask the bot's administrator to fix this."
    )?;

    match kind {
        FeedKind::PubSubHubbub { hub_url, topic, .. } => {
            let callback_url = format!("{}/websub/{}", state.core.config.domain, feed_id);
            let secret = derive_feed_secret(&internal_api_secret, &feed_id);
            let sub_result = request_hub_subscription(&state.core.reqwest_client, &hub_url, &topic, &callback_url, &secret).await;

            match sub_result {
                Ok(_) => {
                    ctx.say(format!(
                        "Subscribed to **{feed_title}** via **WebSub**.",
                    )).await?;
                }
                Err(e) => {
                    tracing::error!(error = ?e, "Failed to subscribe to WebSub hub");
                    ctx.say(format!(
                        "Subscribed to **{feed_title}**, but the WebSub Hub returned an error. Fallback may be required.",
                    )).await?;
                }
            }
        }
        FeedKind::Polling { interval_secs, .. } => {
            ctx.say(format!(
                "Subscribed to **{feed_title}** via **Polling** every {} minutes",
                interval_secs / 60
            )).await?;
        },
    }

    Ok(())
}