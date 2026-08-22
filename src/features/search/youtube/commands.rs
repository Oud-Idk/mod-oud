use crate::core::config::state::Context;
use crate::features::search::youtube;
use anyhow::{Context as _, Result};
use poise::CreateReply;
use rand::seq::IndexedRandom;
use serenity::all::{ButtonStyle, CreateActionRow, CreateButton};

/// Searches for videos on `YouTube`.
#[poise::command(slash_command)]
pub async fn youtube(
    ctx: Context<'_>,
    #[description = "Search query for YouTube"] query: String,
    #[description = "Pick a random video from the search results"] random: Option<bool>,
) -> Result<()> {
    ctx.defer().await?;
    let reqwest_client = ctx.data().core.reqwest_client.clone();
    let api_key = &ctx.data().core.config.google_cloud_api_key;

    let client = youtube::client::YouTubeClient::new(reqwest_client, api_key);

    let is_random = random.unwrap_or(false);
    let max_results = if is_random { 25 } else { 1 };

    let response = client.search_videos(&query, max_results).await?;

    let chosen_video = if is_random && !response.items.is_empty() {
        response.items.choose(&mut rand::rng()).cloned()
    } else {
        response.items.into_iter().next()
    };

    let video =
        chosen_video.with_context(|| format!("No YouTube videos found for '{query}'"))?;

    let embed = youtube::message::create_youtube_message(&video);
    let video_id = video
        .id
        .video_id
        .clone()
        .with_context(|| "YouTube result missing videoId")?;
    let play_button = CreateButton::new(format!("search_youtube_play:{video_id}"))
        .label("▶️ Add to VC Queue")
        .style(ButtonStyle::Success);
    let components = vec![CreateActionRow::Buttons(vec![play_button])];
    let reply = CreateReply::default().embed(embed).components(components);

    ctx.send(reply).await?;

    Ok(())
}
