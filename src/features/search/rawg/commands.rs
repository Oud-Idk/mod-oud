use crate::core::config::state::Context;
use crate::features::search::rawg;
use anyhow::Context as _;
use anyhow::Result;
use poise::CreateReply;
use serenity::all::CreateEmbed;
use crate::constants::BRAND_COLOR;

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
        .with_context(|| {
            "RAWG API key is not set up. Please contact the hoster of the bot to set it up."
        })?;

    let client = rawg::client::RawgClient::new(reqwest_client, api_key);

    let response = client.search_games(&query, Some(20)).await?;

    let q_lower = query.to_lowercase();


    let chosen_game = response
        .results
        .iter()
        .filter(|g| {
            let name_lower = g.name.to_lowercase();
            q_lower.split_whitespace().all(|word| name_lower.contains(word))
        })
        .max_by_key(|game| game.added.unwrap_or(0))
        .cloned()
        .or_else(|| response.results.into_iter().next());

    let game = chosen_game.with_context(|| format!("No game found for '{query}'"))?;

    // Format platform names
    let platforms = game
        .platforms
        .as_deref()
        .filter(|p| !p.is_empty())
        .map_or_else(|| "N/A".to_string(), |p| {
            p.iter()
                .map(|pw| pw.platform.name.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        });

    // Format genre names
    let genres = game
        .genres
        .as_deref()
        .filter(|g| !g.is_empty())
        .map_or_else(|| "N/A".to_string(), |g| {
            g.iter()
                .map(|gw| gw.name.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        });

    // Build the rich embed
    let rawg_url = format!("https://rawg.io/games/{}", game.slug);
    let rating_string = game.esrb_rating.as_ref().map_or("None", |r| r.name.as_str());
    let mut embed = CreateEmbed::new()
        .title(&game.name)
        .url(rawg_url)
        .field("📅 Release Date", game.released.as_deref().unwrap_or("TBA"), true)
        .field("⭐ Rating", game.rating.map_or_else(|| "N/A".to_string(), |r| format!("{r:.2}/5")), true)
        .field(
            "🎯 Metacritic",
            game.metacritic.map_or_else(|| "N/A".to_string(), |m| format!("{m}/100")),
            true,
        )
        .field("🏷️ Genres", genres, false)
        .field("ESRB Rating", rating_string, true)
        .field("🎮 Platforms", platforms, false)
        .color(BRAND_COLOR);

    // Attach background image / poster if available
    if let Some(image_url) = game.background_image {
        embed = embed.image(image_url);
    }

    let reply = CreateReply::default().embed(embed);
    ctx.send(reply).await?;

    Ok(())
}