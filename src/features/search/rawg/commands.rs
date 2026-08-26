use crate::core::config::state::Context;
use crate::features::search::rawg;
use anyhow::Context as _;
use anyhow::Result;
use poise::CreateReply;

/// Searches for video games via RAWG.
#[poise::command(slash_command)]
pub async fn rawg(
    ctx: Context<'_>,
    #[description = "What game do you want to find?"] query: String,
) -> Result<()> {
    ctx.defer().await?;

    let reqwest_client = ctx.data().core.reqwest_client.clone();
    let api_key = ctx
        .data()
        .core
        .config
        .rawg_api_key
        .as_deref()
        .with_context(
            || "RAWG API key is not set up. Please contact the hoster of the bot to set it up.",
        )?;

    let client = rawg::client::RawgClient::new(reqwest_client, api_key);

    let response = client.search_games(&query, Some(20)).await?;

    let q_lower = query.to_lowercase();

    let chosen_game = response
        .results
        .iter()
        .filter(|g| {
            let name_lower = g.name.to_lowercase();
            q_lower
                .split_whitespace()
                .all(|word| name_lower.contains(word))
        })
        .max_by_key(|game| game.added.unwrap_or(0))
        .cloned()
        .or_else(|| response.results.into_iter().next());

    let game = chosen_game.with_context(|| format!("No game found for '{query}'"))?;

    let embed = rawg::message::create_rawg_message(&game);
    let reply = CreateReply::default().embed(embed);
    ctx.send(reply).await?;

    Ok(())
}
