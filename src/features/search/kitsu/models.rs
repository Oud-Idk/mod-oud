use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// Top-level response container
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KitsuResponse {
    pub data: Vec<AnimeResource>,

    #[serde(default)]
    pub included: Vec<IncludedResource>,

    pub meta: Option<Meta>,
    pub links: Option<PaginationLinks>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IncludedResource {
    pub id: String,
    #[serde(rename = "type")]
    pub resource_type: String,
    pub attributes: IncludedAttributes,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IncludedAttributes {
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Meta {
    pub count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaginationLinks {
    pub first: Option<String>,
    pub prev: Option<String>,
    pub next: Option<String>,
    pub last: Option<String>,
}

// Single Anime Item
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnimeResource {
    pub id: String,
    #[serde(rename = "type")]
    pub resource_type: String,
    pub attributes: AnimeAttributes,
}

// The juicy payload inside .attributes
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimeAttributes {
    pub slug: Option<String>,
    pub synopsis: Option<String>,
    pub description: Option<String>,
    pub canonical_title: String,
    pub titles: Option<Titles>,
    pub abbreviated_titles: Option<Vec<String>>,

    // Kitsu sends averageRating as a String (e.g. "84.46") or null
    pub average_rating: Option<String>,
    pub rating_frequencies: Option<HashMap<String, String>>,

    pub user_count: Option<u64>,
    pub favorites_count: Option<u64>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub popularity_rank: Option<u64>,
    pub rating_rank: Option<u64>,

    pub age_rating: Option<String>,
    pub age_rating_guide: Option<String>,
    pub subtype: Option<String>,
    pub status: Option<String>,

    pub poster_image: Option<ImageSizes>,
    pub cover_image: Option<ImageSizes>,

    pub episode_count: Option<u32>,
    pub episode_length: Option<u32>,
    pub total_length: Option<u32>,
    pub youtube_video_id: Option<String>,
    pub show_type: Option<String>,
    pub nsfw: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Titles {
    pub en: Option<String>,
    pub en_jp: Option<String>,
    pub en_us: Option<String>,
    pub ja_jp: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageSizes {
    pub tiny: Option<String>,
    pub small: Option<String>,
    pub medium: Option<String>,
    pub large: Option<String>,
    pub original: Option<String>,
}

// Manga related
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KitsuMangaResponse {
    pub data: Vec<MangaResource>,
    #[serde(default)]
    pub included: Vec<IncludedResource>,
    pub meta: Option<Meta>,
}

impl KitsuMangaResponse {
    pub fn total_count(&self) -> u64 {
        self.meta.as_ref().map_or(0, |m| m.count)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MangaResource {
    pub id: String,
    pub attributes: MangaAttributes,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MangaAttributes {
    pub slug: Option<String>,
    pub canonical_title: String,
    pub synopsis: Option<String>,
    pub average_rating: Option<String>,
    pub subtype: Option<String>,
    pub status: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub chapter_count: Option<u32>,
    pub volume_count: Option<u32>,
    pub serialization: Option<String>,
    pub rating_rank: Option<u64>,
    pub poster_image: Option<ImageSizes>,
}
