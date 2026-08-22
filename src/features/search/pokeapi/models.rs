use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pokemon {
    pub id: u32,
    pub name: String,
    pub height: u32, // in decimetres (divide by 10 for meters)
    pub weight: u32, // in hectograms (divide by 10 for kg)
    #[serde(default)]
    pub types: Vec<TypeSlot>,
    #[serde(default)]
    pub stats: Vec<StatSlot>,
    #[serde(default)]
    pub abilities: Vec<AbilitySlot>,
    pub sprites: Sprites,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TypeSlot {
    pub slot: u8,
    pub r#type: NamedResource,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatSlot {
    pub base_stat: u32,
    pub stat: NamedResource,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AbilitySlot {
    pub is_hidden: bool,
    pub ability: NamedResource,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NamedResource {
    pub name: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sprites {
    pub front_default: Option<String>,
    pub other: Option<OtherSprites>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OtherSprites {
    #[serde(rename = "official-artwork")]
    pub official_artwork: Option<OfficialArtwork>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OfficialArtwork {
    pub front_default: Option<String>,
}

impl Pokemon {
    /// Formatted types with emojis
    pub fn format_types(&self) -> String {
        self.types
            .iter()
            .map(|t| {
                let name = &t.r#type.name;
                let emoji = match name.as_str() {
                    "fire" => "🔥",
                    "water" => "💧",
                    "grass" => "🌿",
                    "electric" => "⚡",
                    "ice" => "❄️",
                    "fighting" => "🥊",
                    "poison" => "☠️",
                    "ground" => "🏜️",
                    "flying" => "🦅",
                    "psychic" => "🔮",
                    "bug" => "🐛",
                    "rock" => "🪨",
                    "ghost" => "👻",
                    "dragon" => "🐉",
                    "steel" => "⚙️",
                    "fairy" => "✨",
                    "dark" => "🌑",
                    _ => "🔘",
                };
                let capitalized = format!("{}{}", name[..1].to_uppercase(), &name[1..]);
                format!("{emoji} {capitalized}")
            })
            .collect::<Vec<_>>()
            .join(" / ")
    }

    /// Best available artwork (HD official artwork -> fallback to sprite)
    pub fn artwork_url(&self) -> Option<String> {
        self.sprites
            .other
            .as_ref()
            .and_then(|o| o.official_artwork.as_ref())
            .and_then(|a| a.front_default.clone())
            .or_else(|| self.sprites.front_default.clone())
    }
}