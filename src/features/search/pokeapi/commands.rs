use crate::core::config::state::Context;
use crate::features::search::pokeapi;
use anyhow::Context as _;
use anyhow::Result;
use poise::CreateReply;

/// Look up a Pokémon by name/ID, or roll a random one!
#[poise::command(slash_command)]
pub async fn pokemon(
    ctx: Context<'_>,
    #[description = "Pokémon name or Pokédex number"] query: String,
) -> Result<()> {
    ctx.defer().await?;

    let reqwest_client = ctx.data().core.reqwest_client.clone();
    let client = pokeapi::client::PokemonClient::new(reqwest_client);

    let pkm = client
        .get_pokemon(&query.to_lowercase())
        .await
        .with_context(|| format!("Pokémon '{query}' not found! Check the spelling or ID."))?;

    let embed = pokeapi::message::create_pokemon_message(&pkm);
    let reply = CreateReply::default().embed(embed);
    ctx.send(reply).await?;

    Ok(())
}
