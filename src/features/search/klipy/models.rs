use serde::{Deserialize, Serialize};

#[derive(Debug, poise::ChoiceParameter, Clone, Copy, PartialEq, Eq)]
pub enum KlipyMediaType {
    #[name = "GIFs"]
    Gifs,
    #[name = "Memes"]
    Memes,
    #[name = "Stickers"]
    Stickers,
    #[name = "Clips"]
    Clips,
}

impl KlipyMediaType {
    pub const fn as_endpoint_path(self) -> &'static str {
        match self {
            Self::Gifs => "gifs",
            Self::Memes => "static-memes",
            Self::Stickers => "stickers",
            Self::Clips => "clips",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KlipyResponse {
    #[serde(default)]
    pub result: bool,
    pub data: KlipyDataContainer,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KlipyDataContainer {
    #[serde(default)]
    pub data: Vec<KlipyItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KlipyItem {
    pub id: Option<u64>,
    pub slug: Option<String>,
    pub title: Option<String>,
    #[serde(rename = "type")]
    pub media_type: Option<String>,
    #[serde(default)]
    pub file: Option<KlipyFiles>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KlipyFiles {
    pub hd: Option<KlipyFormats>,
    pub md: Option<KlipyFormats>,
    pub sm: Option<KlipyFormats>,
    pub xs: Option<KlipyFormats>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KlipyFormats {
    pub gif: Option<KlipyMediaDetail>,
    pub webp: Option<KlipyMediaDetail>,
    pub jpg: Option<KlipyMediaDetail>,
    pub png: Option<KlipyMediaDetail>,
    pub mp4: Option<KlipyMediaDetail>,
    pub webm: Option<KlipyMediaDetail>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KlipyMediaDetail {
    pub url: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub size: Option<u64>,
}

impl KlipyItem {
    /// Extracts the best direct URL for Discord Embeds (prioritizes GIF -> PNG -> JPG -> WEBP across HD/MD tiers)
    pub fn get_media_url(&self) -> Option<&str> {
        let files = self.file.as_ref()?;
        let tiers = [&files.hd, &files.md, &files.sm, &files.xs];

        for tier in tiers.into_iter().flatten() {
            if let Some(detail) = tier
                .gif
                .as_ref()
                .or(tier.png.as_ref())
                .or(tier.jpg.as_ref())
                .or(tier.webp.as_ref())
            {
                return Some(&detail.url);
            }
        }

        None
    }

    /// Link back to Klipy post
    pub fn get_web_url(&self) -> Option<String> {
        self.slug.as_ref().map(|s| format!("https://klipy.com/gif/{s}"))
    }
}
