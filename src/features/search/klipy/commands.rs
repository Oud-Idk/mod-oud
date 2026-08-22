use crate::core::config::state::Context;
use crate::features::search::klipy;
use crate::features::search::klipy::models::KlipyMediaType;
use anyhow::{Context as _, Result};
use poise::{ChoiceParameter, CreateReply};
use rand::seq::IndexedRandom;
use serenity::all::CreateEmbed;
use crate::constants::BRAND_COLOR;

/// Search Klipy for GIFs, Memes, Stickers, or Clips.
#[poise::command(slash_command)]
pub async fn klipy(
    ctx: Context<'_>,
    #[description = "Search query"] query: String,
    #[description = "Type of media (GIFs, Memes, Stickers, Clips)"] media_type: Option<
        KlipyMediaType,
    >,
    #[description = "Pick a random item from search results"] random: Option<bool>,
) -> Result<()> {
    ctx.defer().await?;
    let reqwest_client = ctx.data().core.reqwest_client.clone();
    let app_key = ctx
        .data()
        .core
        .config
        .klipy_api_key
        .as_deref()
        .filter(|k| !k.trim().is_empty())
        .with_context(
            || "KLIPY API key is not set up in environment variables (`KLIPY_API_KEY`).",
        )?;

    let client = klipy::client::KlipyClient::new(reqwest_client, app_key);

    let selected_type = media_type.unwrap_or(KlipyMediaType::Gifs);
    let is_random = random.unwrap_or(false);
    let per_page = if is_random { 25 } else { 1 };

    let response = client.search(selected_type, &query, per_page).await?;

    let chosen_item = if is_random && !response.data.data.is_empty() {
        response.data.data.choose(&mut rand::rng()).cloned()
    } else {
        response.data.data.into_iter().next()
    };

    let item = chosen_item
        .with_context(|| format!("No {} found for '{}'", selected_type.name(), query))?;

    let image_url = item
        .get_media_url()
        .with_context(|| "Failed to extract media URL from Klipy response.")?;

    let title = item
        .title
        .as_deref()
        .filter(|t| !t.trim().is_empty())
        .unwrap_or(&query);

    let mut embed = CreateEmbed::new()
        .title(format!("[{}] {}", selected_type.name(), title))
        .image(image_url)
        .color(BRAND_COLOR);

    if let Some(url) = item.get_web_url() {
        embed = embed.url(url);
    }

    let reply = CreateReply::default().embed(embed);
    ctx.send(reply).await?;

    Ok(())
}
