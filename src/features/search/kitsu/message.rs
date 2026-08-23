use crate::constants::BRAND_COLOR;
use crate::features::search::kitsu::models::{AnimeResource, KitsuResponse};
use crate::features::search::kitsu::models::{KitsuMangaResponse, MangaResource};
use serenity::all::{CreateEmbed, CreateEmbedFooter};

struct KitsuEmbedParams<'a> {
    canonical_title: &'a str,
    url: String,
    synopsis: &'a str,
    status: &'a str,
    subtype: String,
    genres_str: String,
    date_label: &'a str,
    date_value: String,
    primary_count_label: &'a str,
    primary_count: String,
    secondary_count_label: Option<&'a str>,
    secondary_count: Option<String>,
    score_str: String,
    rank_str: String,
    footer_text: String,
    poster_url: Option<&'a str>,
}

fn build_kitsu_embed(params: KitsuEmbedParams) -> CreateEmbed {
    let mut embed = CreateEmbed::new()
        .color(BRAND_COLOR)
        .title(params.canonical_title)
        .url(params.url)
        .description(params.synopsis)
        .field("⌛ Status", params.status, true)
        .field("📁 Type", params.subtype, true)
        .field("\u{200B}", "\u{200B}", true)
        .field("➡️ Genres", params.genres_str, false)
        .field(params.date_label, params.date_value, false)
        .field(params.primary_count_label, params.primary_count, true)
        .field("⭐ Average Rating", params.score_str, true)
        .field("🏆 Rank", params.rank_str, false);

    if let Some(sec_label) = params.secondary_count_label && let Some(sec_val) = params.secondary_count {
        embed = embed.field(sec_label, sec_val, true);
    }

    embed = embed.footer(CreateEmbedFooter::new(params.footer_text));

    if let Some(url) = params.poster_url {
        embed = embed.thumbnail(url);
    }

    embed
}

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

    let poster_url = attributes
        .poster_image
        .as_ref()
        .and_then(|p| p.medium.as_deref().or(p.large.as_deref()));

    build_kitsu_embed(KitsuEmbedParams {
        canonical_title: &attributes.canonical_title,
        url: anime_url,
        synopsis: attributes
            .synopsis
            .as_deref()
            .unwrap_or("No description available."),
        status: attributes.status.as_deref().unwrap_or("N/A"),
        subtype: attributes
            .subtype
            .as_deref()
            .unwrap_or("N/A")
            .to_uppercase(),
        genres_str,
        date_label: "🗓️ Aired",
        date_value: format!("from **{start_date}** to **{end_date}**"),
        primary_count_label: "💽 Total Episodes",
        primary_count: attributes
            .episode_count
            .map_or_else(|| "?".to_string(), |c| c.to_string()),
        secondary_count_label: Some("⏱ Duration"),
        secondary_count: Some(
            attributes
                .episode_length
                .map_or_else(|| "N/A".to_string(), |m| format!("{m} mn")),
        ),
        score_str: attributes
            .average_rating
            .as_deref()
            .map_or_else(|| "N/A".to_string(), |score| format!("**{score}/100**")),
        rank_str: attributes
            .rating_rank
            .map_or_else(|| "N/A".to_string(), |rank| format!("TOP {rank}")),
        footer_text: format!(
            "If this is not the correct one, note that there are {} more animes found.",
            response.meta.as_ref().map_or(0, |m| m.count),
        ),
        poster_url,
    })
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

    let poster_url = attributes
        .poster_image
        .as_ref()
        .and_then(|p| p.medium.as_deref().or(p.large.as_deref()));

    build_kitsu_embed(KitsuEmbedParams {
        canonical_title: &attributes.canonical_title,
        url: manga_url,
        synopsis: attributes
            .synopsis
            .as_deref()
            .unwrap_or("No description available."),
        status: attributes.status.as_deref().unwrap_or("N/A"),
        subtype: attributes.subtype.as_deref().unwrap_or("N/A").to_string(),
        genres_str,
        date_label: "🗓️ Published",
        date_value: format!("from **{start_date}** to **{end_date}**"),
        primary_count_label: "📰 Chapters",
        primary_count: attributes
            .chapter_count
            .map_or_else(|| "?".to_string(), |c| c.to_string()),
        secondary_count_label: Some("📚 Volumes"),
        secondary_count: Some(
            attributes
                .volume_count
                .map_or_else(|| "?".to_string(), |v| v.to_string()),
        ),
        score_str: attributes
            .average_rating
            .as_deref()
            .map_or_else(|| "N/A".to_string(), |score| format!("**{score}/100**")),
        rank_str: attributes
            .rating_rank
            .map_or_else(|| "N/A".to_string(), |rank| format!("TOP {rank}")),
        footer_text: format!(
            "If this is not the correct one, note that there are {} more manga found.",
            response.total_count()
        ),
        poster_url,
    })
}
