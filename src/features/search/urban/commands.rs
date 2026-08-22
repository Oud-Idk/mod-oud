use crate::core::config::state::Context;
use crate::features::search::urban;
use anyhow::Context as _;
use poise::CreateReply;
use rand::seq::IndexedRandom;

/// Searches Urban Dictionary for a word or phrase definition.
#[poise::command(slash_command)]
pub async fn urban(
    ctx: Context<'_>,
    #[description = "Word or phrase to define"] query: String,
    #[description = "Pick a random definition from the search results"] random: Option<bool>,
) -> anyhow::Result<()> {
    ctx.defer().await?;
    let reqwest_client = ctx.data().core.reqwest_client.clone();
    let client = urban::client::UrbanClient::new(reqwest_client);

    let response = client.define(&query).await?;
    let is_random = random.unwrap_or(false);

    // Pick a random definition from the search results list, or take the top one
    let chosen_def = if is_random && !response.list.is_empty() {
        response.list.choose(&mut rand::rng()).cloned()
    } else {
        response.list.into_iter().next()
    };

    let def = chosen_def.with_context(|| format!("No definition found for '{query}'"))?;

    let embed = urban::message::create_urban_message(&def);
    let reply = CreateReply::default().embed(embed);

    ctx.send(reply).await?;

    Ok(())
}
