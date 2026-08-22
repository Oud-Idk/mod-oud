use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawgResponse {
    pub count: Option<usize>,
    pub next: Option<String>,
    pub previous: Option<String>,
    #[serde(default)]
    pub results: Vec<Game>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Game {
    pub id: u64,
    pub slug: String,
    pub name: String,

    #[serde(default)]
    pub added: Option<u64>,

    pub playtime: Option<u32>,
    pub released: Option<String>,
    pub tba: Option<bool>,
    pub background_image: Option<String>,

    #[serde(default)]
    pub rating: Option<f64>,
    pub rating_top: Option<u32>,
    pub ratings_count: Option<u64>,
    pub metacritic: Option<u32>,

    // Wrap these in Option<Vec<...>> to handle nulls gracefully
    pub platforms: Option<Vec<PlatformWrapper>>,
    pub parent_platforms: Option<Vec<ParentPlatformWrapper>>,
    pub genres: Option<Vec<Genre>>,
    pub stores: Option<Vec<StoreWrapper>>,
    pub tags: Option<Vec<Tag>>,
    pub short_screenshots: Option<Vec<Screenshot>>,

    pub esrb_rating: Option<EsrbRating>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformWrapper {
    pub platform: Platform,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParentPlatformWrapper {
    pub platform: Platform,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Platform {
    pub id: u64,
    pub name: String,
    pub slug: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Genre {
    pub id: u64,
    pub name: String,
    pub slug: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoreWrapper {
    pub store: Store,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Store {
    pub id: u64,
    pub name: String,
    pub slug: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: u64,
    pub name: String,
    pub slug: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EsrbRating {
    pub id: u64,
    pub name: String,
    pub slug: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Screenshot {
    pub id: i64,
    pub image: String,
}