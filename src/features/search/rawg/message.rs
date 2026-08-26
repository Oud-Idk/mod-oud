use super::models::Game;
use crate::constants::BRAND_COLOR;
use serenity::all::CreateEmbed;

pub fn create_rawg_message(game: &Game) -> CreateEmbed {
    let platforms = game
        .platforms
        .as_deref()
        .filter(|p| !p.is_empty())
        .map_or_else(
            || "N/A".to_string(),
            |p| {
                p.iter()
                    .map(|pw| pw.platform.name.as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            },
        );

    let genres = game
        .genres
        .as_deref()
        .filter(|g| !g.is_empty())
        .map_or_else(
            || "N/A".to_string(),
            |g| {
                g.iter()
                    .map(|gw| gw.name.as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            },
        );

    let rawg_url = format!("https://rawg.io/games/{}", game.slug);
    let rating_string = game
        .esrb_rating
        .as_ref()
        .map_or("None", |r| r.name.as_str());
    let mut embed = CreateEmbed::new()
        .title(&game.name)
        .url(rawg_url)
        .field(
            "📅 Release Date",
            game.released.as_deref().unwrap_or("TBA"),
            true,
        )
        .field(
            "⭐ Rating",
            game.rating
                .map_or_else(|| "N/A".to_string(), |r| format!("{r:.2}/5")),
            true,
        )
        .field(
            "🎯 Metacritic",
            game.metacritic
                .map_or_else(|| "N/A".to_string(), |m| format!("{m}/100")),
            true,
        )
        .field("🏷️ Genres", genres, false)
        .field("ESRB Rating", rating_string, true)
        .field("🎮 Platforms", platforms, false)
        .color(BRAND_COLOR);

    if let Some(image_url) = &game.background_image {
        embed = embed.image(image_url);
    }

    embed
}
