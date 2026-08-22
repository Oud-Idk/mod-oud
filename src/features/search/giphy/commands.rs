use crate::core::config::state::Context;
use crate::features::search::giphy;
use anyhow::Context as _;
use anyhow::Result;
use poise::CreateReply;
use rand::seq::IndexedRandom;
use serenity::all::CreateEmbed;

/// Searches for animated GIFs via GIPHY or rolls a random one.
#[poise::command(slash_command)]
pub async fn giphy(
    ctx: Context<'_>,
    #[description = "What GIF do you want to find?"] query: String,
    #[description = "Pick a random GIF from the search results"] random: Option<bool>,
) -> Result<()> {
    ctx.defer().await?;
    let reqwest_client = ctx.data().core.reqwest_client.clone();
    let api_key = ctx
        .data()
        .core
        .config
        .giphy_api_key
        .as_deref()
        .with_context(
            || "Giphy API key is not set up. Please contact the hoster of the bot to set it up.",
        )?;

    let client = giphy::client::GiphyClient::new(reqwest_client, api_key);

    let is_random = random.unwrap_or(false);
    // If random, fetch 25 candidates to pick from; otherwise just fetch 1
    let limit = if is_random { 25 } else { 1 };

    let response = client.search_gif(&query, Some(limit)).await?;

    // Pick random from the list or take the first one
    let chosen_gif = if is_random {
        let mut rng = rand::rng();
        response.data.choose(&mut rng).cloned()
    } else {
        response.data.into_iter().next()
    };

    let gif = chosen_gif.with_context(|| format!("No GIF found for '{query}'"))?;

    let title = gif
        .title
        .as_deref()
        .filter(|t| !t.trim().is_empty())
        .unwrap_or(&query);

    let embed = CreateEmbed::new()
        .title(title)
        .url(&gif.url)
        .image(&gif.images.original.url);

    let reply = CreateReply::default().embed(embed);
    ctx.send(reply).await?;

    Ok(())
}
