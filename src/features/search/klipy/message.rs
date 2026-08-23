use super::models::{KlipyItem, KlipyMediaType};
use crate::constants::BRAND_COLOR;
use poise::ChoiceParameter;
use serenity::all::CreateEmbed;

pub fn create_klipy_message(
    item: &KlipyItem,
    query: &str,
    media_type: KlipyMediaType,
) -> Option<CreateEmbed> {
    let image_url = item.get_media_url()?;
    let title = item
        .title
        .as_deref()
        .filter(|t| !t.trim().is_empty())
        .unwrap_or(query);

    let mut embed = CreateEmbed::new()
        .title(format!("[{}] {}", media_type.name(), title))
        .image(image_url)
        .color(BRAND_COLOR);

    if let Some(url) = item.get_web_url() {
        embed = embed.url(url);
    }

    Some(embed)
}
