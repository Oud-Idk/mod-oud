use crate::core::config::state::Context;
use crate::features::search::giphy;
use anyhow::Context as _;
use anyhow::Result;
use poise::CreateReply;

use crate::features::search::choose_or_first;

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
    let limit = if is_random { 25 } else { 1 };

    let response = client.search_gif(&query, Some(limit)).await?;

    let chosen_gif = choose_or_first(response.data, is_random);

    let gif = chosen_gif.with_context(|| format!("No GIF found for '{query}'"))?;

    let embed = giphy::message::create_giphy_message(&gif, &query);
    let reply = CreateReply::default().embed(embed);
    ctx.send(reply).await?;

    Ok(())
}
