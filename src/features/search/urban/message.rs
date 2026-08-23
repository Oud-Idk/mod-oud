use super::models::UrbanDefinition;
use crate::constants::BRAND_COLOR;
use crate::features::search::truncate;
use serenity::all::{CreateEmbed, CreateEmbedFooter};

pub fn create_urban_message(entry: &UrbanDefinition) -> CreateEmbed {
    let definition = truncate(&entry.definition, 2048);

    let mut embed = CreateEmbed::new()
        .color(BRAND_COLOR)
        .title(format!("Definition of {}", entry.word))
        .url(&entry.permalink)
        .description(definition);

    if !entry.example.trim().is_empty() {
        let example = truncate(&entry.example, 1024);
        embed = embed.field("Example", example, false);
    }

    embed
        .field("👍", entry.thumbs_up.to_string(), true)
        .field("👎", entry.thumbs_down.to_string(), true)
        .footer(CreateEmbedFooter::new(format!("Sent by {}", entry.author)))
}
