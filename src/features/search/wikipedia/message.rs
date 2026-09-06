use serenity::all::{CreateEmbed, CreateEmbedFooter};
use crate::constants::BRAND_COLOR;
use crate::features::search::truncate;
use crate::features::search::wikipedia::models::WikiSummary;

pub fn create_wikipedia_message(entry: &WikiSummary) -> CreateEmbed {
    let content = match &entry.description {
        Some(desc) => format!("*{}*\n\n{}", desc, entry.extract),
        None => entry.extract.clone(),
    };

    let description_text = truncate(&content, 2048);

    let mut embed = CreateEmbed::new()
        .color(BRAND_COLOR)
        .title(&entry.title)
        .url(&entry.content_urls.desktop.page)
        .description(description_text)
        .footer(
            CreateEmbedFooter::new("From Wikipedia, the free encyclopedia")
                .icon_url("https://upload.wikimedia.org/wikipedia/commons/6/63/Wikipedia-logo.png")
        );

    if let Some(thumb) = &entry.thumbnail {
        embed = embed.thumbnail(&thumb.source);
    }

    embed
}