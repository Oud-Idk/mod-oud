use super::models::{WordOfTheDay, WordnikDefinition};
use crate::constants::BRAND_COLOR;
use crate::features::search::truncate;
use serenity::all::{CreateEmbed, CreateEmbedFooter};

/// Creates a Discord embed from a Wordnik entry definition.
pub fn create_wordnik_message(entry: &WordnikDefinition) -> CreateEmbed {
    let word = entry.word.as_deref().unwrap_or("Unknown Word");
    let raw_definition = entry.text.as_deref().unwrap_or("No definition provided.");
    let definition = truncate(raw_definition, 2048);

    let permalink = format!("https://www.wordnik.com/words/{}", word);

    let mut embed = CreateEmbed::new()
        .color(BRAND_COLOR)
        .title(format!("Definition of {}", word))
        .url(permalink)
        .description(definition);

    if let Some(pos) = &entry.part_of_speech {
        if !pos.trim().is_empty() {
            embed = embed.field("Part of Speech", pos, true);
        }
    }

    if let Some(source) = &entry.source_dictionary {
        if !source.trim().is_empty() {
            embed = embed.field("Source", source, true);
        }
    }

    let footer_text = entry
        .attribution_text
        .as_deref()
        .unwrap_or("Powered by Wordnik");

    embed.footer(CreateEmbedFooter::new(truncate(footer_text, 2048)))
}

/// Creates a Discord embed from multiple Wordnik definitions.
pub fn create_wordnik_multi_message(entries: &[WordnikDefinition]) -> CreateEmbed {
    let first = &entries[0];
    let word = first.word.as_deref().unwrap_or("Unknown Word");
    let permalink = format!("https://www.wordnik.com/words/{}", word);

    let mut embed = CreateEmbed::new()
        .color(BRAND_COLOR)
        .title(format!("Definitions of {}", word))
        .url(permalink);

    for (i, entry) in entries.iter().enumerate() {
        let raw_definition = entry.text.as_deref().unwrap_or("No definition provided.");
        let definition = truncate(raw_definition, 1024);

        let pos = entry
            .part_of_speech
            .as_deref()
            .filter(|p| !p.trim().is_empty())
            .map(|p| format!("*({})*", p))
            .unwrap_or_default();

        let field_name = format!("{}. {}", i + 1, pos);
        embed = embed.field(field_name, definition, false);
    }

    let footer_text = first
        .attribution_text
        .as_deref()
        .unwrap_or("Powered by Wordnik");

    embed.footer(CreateEmbedFooter::new(truncate(footer_text, 2048)))
}

/// Creates a Discord embed from a Wordnik WoTD.
pub fn create_wotd_message(entry: &WordOfTheDay) -> CreateEmbed {
    let permalink = format!("https://www.wordnik.com/words/{}", entry.word);

    let primary_def = entry
        .definitions
        .as_ref()
        .and_then(|defs| defs.first());

    let description = if let Some(def) = primary_def {
        let pos_prefix = def
            .part_of_speech
            .as_deref()
            .map(|pos| format!("*({})* ", pos))
            .unwrap_or_default();

        let text = def.text.as_deref().unwrap_or("No definition text provided.");
        truncate(&format!("{}{}", pos_prefix, text), 2048)
    } else {
        "No definition available.".to_string()
    };

    let mut embed = CreateEmbed::new()
        .color(BRAND_COLOR)
        .title(format!("Word of the Day: {}", entry.word))
        .url(permalink)
        .description(description);

    if let Some(example) = entry.examples.as_ref().and_then(|exs| exs.first()) {
        if let Some(text) = &example.text {
            if !text.trim().is_empty() {
                let quote = match &example.title {
                    Some(source) => format!("\"{}\"\n— *{}*", text.trim(), source.trim()),
                    None => format!("\"{}\"", text.trim()),
                };

                embed = embed.field("Example", truncate(&quote, 1024), false);
            }
        }
    }

    // Add Wordnik's editor note / trivia (often fascinating)
    if let Some(note) = &entry.note {
        if !note.trim().is_empty() {
            embed = embed.field("Did You Know?", truncate(note, 1024), false);
        }
    }

    let footer_text = match &entry.publish_date {
        Some(date) => {
            let simple_date = date.split('T').next().unwrap_or(date);
            format!("Word of the Day • {}", simple_date)
        }
        None => "Word of the Day • Wordnik".to_string(),
    };

    embed.footer(CreateEmbedFooter::new(footer_text))
}