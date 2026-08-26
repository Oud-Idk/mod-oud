use crate::core::config::state::Context;
use crate::features::search::urban;
use anyhow::Context as _;
use poise::CreateReply;

use crate::features::search::choose_or_first;

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

    let chosen_def = choose_or_first(response.list, is_random);

    let def = chosen_def.with_context(|| format!("No definition found for '{query}'"))?;

    let embed = urban::message::create_urban_message(&def);
    let reply = CreateReply::default().embed(embed);

    ctx.send(reply).await?;

    Ok(())
}
