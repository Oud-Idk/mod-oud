use crate::core::config::state::Context;
use crate::features::search::tmdb;
use crate::features::search::tmdb::models::{TmdbDetail, TmdbMediaType};
use anyhow::{Context as _, Result};
use poise::CreateReply;

/// Search TMDB for a movie or TV show.
#[poise::command(slash_command)]
pub async fn movie(
    ctx: Context<'_>,
    #[description = "Title to search for"] query: String,
    #[description = "Movie or TV show"] media_type: Option<TmdbMediaType>,
) -> Result<()> {
    ctx.defer().await?;

    let reqwest_client = ctx.data().core.reqwest_client.clone();
    let api_key = ctx
        .data()
        .core
        .config
        .tmdb_api_key
        .as_deref()
        .filter(|k| !k.trim().is_empty())
        .with_context(|| "TMDB API key is not set up in environment variables (`TMDB_API_KEY`).")?;

    let client = tmdb::client::TmdbClient::new(reqwest_client, api_key);
    let selected_type = media_type.unwrap_or(TmdbMediaType::Movie);

    let search_response = client.search(selected_type, &query).await?;
    let top_result = search_response
        .results
        .into_iter()
        .next()
        .with_context(|| format!("No {} found for '{}'", selected_type.name(), query))?;

    let detail = match selected_type {
        TmdbMediaType::Movie => TmdbDetail::Movie(client.get_movie_details(top_result.id).await?),
        TmdbMediaType::Tv => TmdbDetail::Tv(client.get_tv_details(top_result.id).await?),
    };

    let embed = tmdb::message::create_tmdb_message(&detail, selected_type, top_result.id);
    let reply = CreateReply::default().embed(embed);
    ctx.send(reply).await?;
    Ok(())
}
