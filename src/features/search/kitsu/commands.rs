use crate::core::config::state::Context;
use crate::features::search::kitsu;
use anyhow::Context as _;
use poise::CreateReply;

/// Searches an anime for details. Provided by Kitsu.io.
#[poise::command(slash_command)]
pub async fn anime(
    ctx: Context<'_>,
    #[description = "Your query"] query: String,
) -> anyhow::Result<()> {
    ctx.defer().await?;
    let reqwest_client = ctx.data().core.reqwest_client.clone();
    let client = kitsu::client::KitsuClient::new(reqwest_client);

    let response = client.search_anime(&query, Some(1)).await?;
    let first_anime = response.data.first().with_context(|| "No anime found.")?;

    let embed = kitsu::message::create_anime_message(&response, first_anime);
    let reply = CreateReply::default().embed(embed);

    ctx.send(reply).await?;

    Ok(())
}

/// Searches for a manga's details. Provided by Kitsu.io.
#[poise::command(slash_command)]
pub async fn manga(
    ctx: Context<'_>,
    #[description = "Manga title to search"] query: String,
) -> anyhow::Result<()> {
    ctx.defer().await?;
    let reqwest_client = ctx.data().core.reqwest_client.clone();
    let client = kitsu::client::KitsuClient::new(reqwest_client);

    let response = client.search_manga(&query, Some(1)).await?;
    let first_manga = response.data.first().with_context(|| "No manga found.")?;

    let embed = kitsu::message::create_manga_message(&response, first_manga);
    let reply = CreateReply::default().embed(embed);

    ctx.send(reply).await?;

    Ok(())
}
