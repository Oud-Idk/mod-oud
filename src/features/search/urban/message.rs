use super::models::UrbanDefinition;
use crate::constants::BRAND_COLOR;
use serenity::all::{CreateEmbed, CreateEmbedFooter};

pub fn create_urban_message(entry: &UrbanDefinition) -> CreateEmbed {
    // Discord max description is 4096 chars
    let definition = if entry.definition.len() > 2048 {
        format!("{}...", &entry.definition[..2045])
    } else {
        entry.definition.clone()
    };

    let mut embed = CreateEmbed::new()
        .color(BRAND_COLOR)
        .title(format!("Definition of {}", entry.word))
        .url(&entry.permalink)
        .description(definition);

    // Discord max field value is 1024 chars
    if !entry.example.trim().is_empty() {
        let example = if entry.example.len() > 1024 {
            format!("{}...", &entry.example[..1021])
        } else {
            entry.example.clone()
        };
        embed = embed.field("Example", example, false);
    }

    embed
        .field("👍", entry.thumbs_up.to_string(), true)
        .field("👎", entry.thumbs_down.to_string(), true)
        .footer(CreateEmbedFooter::new(format!("Sent by {}", entry.author)))
}
