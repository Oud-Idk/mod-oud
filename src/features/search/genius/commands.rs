use anyhow::Context as _;
use crate::core::config::state::Context;
use crate::features::search::genius::client::GeniusClient;

/// Searches a lyrics for a song from Genius.
#[poise::command(slash_command)]
pub async fn genius(
    ctx: Context<'_>,
    #[description = "The Query"] query: String,
) -> anyhow::Result<()> {
    ctx.defer().await?;
    let reqwest_client = ctx.data().core.reqwest_client.clone();
    let api_key = ctx
        .data()
        .core
        .config
        .genius_api_key
        .as_deref()
        .with_context(
            || "Genius API key is not set up. Please contact the hoster of the bot to set it up.",
        )?;
    let client = GeniusClient::new(api_key, reqwest_client);
    let Some(output) = client.search_lyrics_for_discord(&query).await? else {
        ctx.say(format!("Lyrics not found for query `{query}`.")).await?;
        return Ok(());
    };

    ctx.say(output.as_str()).await?;

    Ok(())
}