use crate::constants::BRAND_COLOR;
use crate::features::search::kitsu::models::{AnimeResource, KitsuResponse};
use crate::features::search::kitsu::models::{KitsuMangaResponse, MangaResource};
use serenity::all::{CreateEmbed, CreateEmbedFooter};

pub fn create_anime_message(response: &KitsuResponse, first_anime: &AnimeResource) -> CreateEmbed {
    let attributes = &first_anime.attributes;
    let anime_url = format!(
        "https://kitsu.app/anime/{}",
        attributes.slug.as_deref().unwrap_or(&first_anime.id)
    );

    let genres_list: Vec<&str> = response
        .included
        .iter()
        .filter(|inc| inc.resource_type == "categories")
        .filter_map(|inc| inc.attributes.title.as_deref())
        .take(6)
        .collect();

    let genres_str = if genres_list.is_empty() {
        "N/A".to_string()
    } else {
        genres_list.join(", ")
    };

    let start_date = attributes.start_date.as_deref().unwrap_or("?");
    let end_date = attributes.end_date.as_deref().unwrap_or("Present");
    let aired_str = format!("from **{start_date}** to **{end_date}**");

    let episode_count = attributes
        .episode_count
        .map_or_else(|| "?".to_string(), |c| c.to_string());

    let duration_str = attributes
        .episode_length
        .map_or_else(|| "N/A".to_string(), |m| format!("{m} mn"));

    let score_str = attributes
        .average_rating
        .as_deref()
        .map_or_else(|| "N/A".to_string(), |score| format!("**{score}/100**"));

    let rank_str = attributes
        .rating_rank
        .map_or_else(|| "N/A".to_string(), |rank| format!("TOP {rank}"));

    let mut embed = CreateEmbed::new()
        .color(BRAND_COLOR)
        .title(&attributes.canonical_title)
        .url(anime_url)
        .description(
            attributes
                .synopsis
                .as_deref()
                .unwrap_or("No description available."),
        )
        // Status & Type (using zero-width space spacer for 2-column look)
        .field(
            "⌛ Status",
            attributes.status.as_deref().unwrap_or("N/A"),
            true,
        )
        .field(
            "📁 Type",
            attributes
                .subtype
                .as_deref()
                .unwrap_or("N/A")
                .to_uppercase(),
            true,
        )
        .field("\u{200B}", "\u{200B}", true)
        .field("➡️ Genres", genres_str, false)
        .field("🗓️ Aired", aired_str, false)
        .field("💽 Total Episodes", episode_count, true)
        .field("⏱ Duration", duration_str, true)
        .field("⭐ Average Rating", score_str, true)
        // Rank
        .field("🏆 Rank", rank_str, false)
        .footer(CreateEmbedFooter::new(format!(
            "If this is not the correct one, note that there are {} more animes found.",
            response.meta.as_ref().map_or(0, |m| m.count),
        )));

    // Add Poster image to top-right thumbnail
    if let Some(poster) = &attributes.poster_image
        && let Some(url) = poster.medium.as_deref().or(poster.large.as_deref()) {
        embed = embed.thumbnail(url);
    }

    embed
}

pub fn create_manga_message(
    response: &KitsuMangaResponse,
    first_manga: &MangaResource,
) -> CreateEmbed {
    let attributes = &first_manga.attributes;
    let manga_url = format!(
        "https://kitsu.app/manga/{}",
        attributes.slug.as_deref().unwrap_or(&first_manga.id)
    );

    let genres_list: Vec<&str> = response
        .included
        .iter()
        .filter(|inc| inc.resource_type == "categories")
        .filter_map(|inc| inc.attributes.title.as_deref())
        .collect();

    let genres_str = if genres_list.is_empty() {
        "N/A".to_string()
    } else {
        genres_list.join(", ")
    };

    let start_date = attributes.start_date.as_deref().unwrap_or("?");
    let end_date = attributes.end_date.as_deref().unwrap_or("?");
    let published_str = format!("from **{start_date}** to **{end_date}**");

    let chapter_count = attributes
        .chapter_count
        .map_or_else(|| "?".to_string(), |c| c.to_string());

    let volume_count = attributes
        .volume_count
        .map_or_else(|| "?".to_string(), |v| v.to_string());

    let score_str = attributes
        .average_rating
        .as_deref()
        .map_or_else(|| "N/A".to_string(), |score| format!("**{score}/100**"));

    let rank_str = attributes
        .rating_rank
        .map_or_else(|| "N/A".to_string(), |rank| format!("TOP {rank}"));

    let mut embed = CreateEmbed::new()
        .color(BRAND_COLOR)
        .title(&attributes.canonical_title)
        .url(manga_url)
        .description(
            attributes
                .synopsis
                .as_deref()
                .unwrap_or("No description available."),
        )
        // Status & Type (using zero-width space spacer for 2-column look)
        .field(
            "⌛ Status",
            attributes.status.as_deref().unwrap_or("N/A"),
            true,
        )
        .field(
            "📁 Type",
            attributes.subtype.as_deref().unwrap_or("N/A"),
            true,
        )
        .field("\u{200B}", "\u{200B}", true)
        // Genres
        .field("➡️ Genres", genres_str, false)
        // Published
        .field("🗓️ Published", published_str, false)
        // Chapters, Volumes, Average Rating (3 columns)
        .field("📰 Chapters", chapter_count, true)
        .field("📚 Volumes", volume_count, true)
        .field("⭐ Average Rating", score_str, true)
        // Rank
        .field("🏆 Rank", rank_str, false)
        .footer(CreateEmbedFooter::new(format!(
            "If this is not the correct one, note that there are {} more manga found.",
            response.total_count()
        )));

    // Top-right thumbnail
    if let Some(url) = attributes
        .poster_image
        .as_ref()
        .and_then(|p| p.medium.as_deref().or(p.large.as_deref()))
    {
        embed = embed.thumbnail(url);
    }

    embed
}
