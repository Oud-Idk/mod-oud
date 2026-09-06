use super::models::{DictionaryAPIResponse, Entry, WordOfTheDay, WordnikDefinition};
use crate::constants::BRAND_COLOR;
use crate::features::search::truncate;
use serenity::all::{CreateEmbed, CreateEmbedFooter};
use std::fmt::Write;

/// Creates a Discord embed from a Wordnik entry definition.
pub fn create_wordnik_message(entry: &WordnikDefinition) -> CreateEmbed {
    let word = entry.word.as_deref().unwrap_or("Unknown Word");
    let raw_definition = entry.text.as_deref().unwrap_or("No definition provided.");
    let definition = truncate(raw_definition, 2048);

    let encoded_word = urlencoding::encode(word);
    let permalink = format!("https://www.wordnik.com/words/{encoded_word}");

    let mut embed = CreateEmbed::new()
        .color(BRAND_COLOR)
        .title(format!("Definition of {word}"))
        .url(permalink)
        .description(definition);

    if let Some(pos) = &entry.part_of_speech {
        embed = embed.field("Part of Speech", pos, true);
    }

    if let Some(source) = &entry.source_dictionary {
        embed = embed.field("Source", source, true);
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
    let permalink = format!("https://www.wordnik.com/words/{word}");

    let mut embed = CreateEmbed::new()
        .color(BRAND_COLOR)
        .title(format!("Definitions of {word}"))
        .url(permalink);

    for (i, entry) in entries.iter().enumerate() {
        let raw_definition = entry.text.as_deref().unwrap_or("No definition provided.");
        let definition = truncate(raw_definition, 1024);

        let pos = entry
            .part_of_speech
            .as_deref()
            .filter(|p| !p.trim().is_empty())
            .map(|p| format!("*({p})*"))
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

/// Creates a Discord embed from a Wordnik `WoTD`.
pub fn create_wotd_message(entry: &WordOfTheDay) -> CreateEmbed {
    let encoded_word = urlencoding::encode(entry.word.as_str());
    let permalink = format!("https://www.wordnik.com/words/{encoded_word}");

    let primary_def = entry.definitions.as_ref().and_then(|defs| defs.first());

    let Some(def) = primary_def else {
        return CreateEmbed::new().description("No definition available.");
    };

    let pos = def
        .part_of_speech
        .as_deref()
        .map(|pos| format!("*({pos})* "))
        .unwrap_or_default();

    let text = def
        .text
        .as_deref()
        .unwrap_or("No definition text provided.");

    let description = truncate(&format!("{pos}{text}"), 2048);

    let mut embed = CreateEmbed::new()
        .color(BRAND_COLOR)
        .title(format!("Word of the Day: {}", entry.word))
        .url(permalink)
        .description(description);

    let example_quote = (|| {
        let example = entry.examples.as_deref()?.first()?;
        let text = example.text.as_deref()?.trim();
        if text.is_empty() {
            return None;
        }

        let quote = match example.title.as_deref().map(str::trim) {
            Some(source) if !source.is_empty() => format!("\"{text}\"\n— *{source}*"),
            _ => format!("\"{text}\""),
        };

        Some(quote)
    })();

    if let Some(quote) = example_quote {
        embed = embed.field("Example", truncate(&quote, 1024), false);
    }

    // Add Wordnik's editor note / trivia (often fascinating)
    if let Some(note) = &entry.note {
        embed = embed.field("Did You Know?", truncate(note, 1024), false);
    }

    let footer_text = entry.publish_date.as_ref().map_or_else(
        || "Word of the Day • Wordnik".to_string(),
        |date| {
            let simple_date = date.split('T').next().unwrap_or(date);
            format!("Word of the Day • {simple_date}")
        },
    );

    embed.footer(CreateEmbedFooter::new(footer_text))
}

fn format_entry_senses(entry: &Entry, max_senses: usize) -> String {
    let mut out = format!("*({})*\n", entry.part_of_speech);

    for (i, s) in entry.senses.iter().take(max_senses).enumerate() {
        if i > 0 {
            out.push_str("\n\n");
        }

        out.push_str(&s.definition);

        if let Some(example) = s.examples.first() {
            let _ = write!(out, "\n*\"{example}\"*");
        }
    }

    out
}

fn create_free_dict_footer(response: &DictionaryAPIResponse) -> CreateEmbedFooter {
    CreateEmbedFooter::new(truncate(
        &response
            .source
            .as_ref()
            .and_then(|s| s.license.as_ref())
            .map_or_else(
                || "Powered by Free Dictionary API".to_string(),
                |license| {
                    format!(
                        "{} • {}",
                        license.name,
                        response.source.as_ref().unwrap().url
                    )
                },
            ),
        2048,
    ))
}

/// Creates a Discord embed from a single Free Dictionary API response.
pub fn create_free_dict_message(response: &DictionaryAPIResponse, count: usize) -> CreateEmbed {
    let entry = response
        .entries
        .iter()
        .find(|e| e.language.code == "en")
        .or_else(|| response.entries.first());

    let mut embed = CreateEmbed::new()
        .color(BRAND_COLOR)
        .title(format!("Definition of {}", response.word));

    if let Some(url) = &response.source {
        embed = embed.url(&url.url);
    }

    if let Some(entry) = entry {
        let description = format_entry_senses(entry, count);
        embed = embed.description(truncate(&description, 2048));

        if let Some(ipa) = entry.pronunciations.iter().find(|p| p.kind == "ipa") {
            embed = embed.field("Pronunciation", &ipa.text, true);
        }
    } else {
        embed = embed.description("No definition available.");
    }

    embed.footer(create_free_dict_footer(&response))
}

/// Creates a Discord embed from multiple Free Dictionary API responses.
pub fn create_free_dict_multi_message(
    responses: &[DictionaryAPIResponse],
    count: usize,
) -> CreateEmbed {
    let first = &responses[0];
    let mut embed = CreateEmbed::new()
        .color(BRAND_COLOR)
        .title(format!("Definitions of {}", first.word));

    if let Some(url) = &first.source {
        embed = embed.url(&url.url);
    }

    let mut shown = 0;
    for (i, response) in responses.iter().enumerate() {
        for entry in &response.entries {
            if shown >= count {
                break;
            }
            let pos = &entry.part_of_speech;
            let definition = entry
                .senses
                .first()
                .map_or("No definition provided.".to_string(), |s| {
                    s.definition.clone()
                });

            let field_name = format!("{}. *({pos})*", i + 1);
            embed = embed.field(field_name, truncate(&definition, 1024), false);
            shown += 1;
        }
        if shown >= count {
            break;
        }
    }

    embed.footer(create_free_dict_footer(&first))
}
