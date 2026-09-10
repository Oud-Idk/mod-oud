use crate::core::config::state::Context;
use anyhow::Context as _;
use poise::CreateReply;
use poise::serenity_prelude::CreateEmbed;

use crate::features::search::dictionary::client::{FreeDictionaryClient, WordnikClient};
use crate::features::search::dictionary::message::{
    create_free_dict_message, create_free_dict_multi_message, create_wordnik_message,
    create_wordnik_multi_message, create_wotd_message,
};

/// Searches for a word or phrase definition.
#[poise::command(slash_command)]
pub async fn dictionary(
    ctx: Context<'_>,
    #[description = "Word or phrase to define"] query: String,
    #[description = "Whether to take the Word of The Day"] wotd: Option<bool>,
    #[description = "Number of definitions to show (1–5, default 1)"] count: Option<usize>,
    #[description = "Try Free Dictionary API before Wordnik (default: Wordnik first)"]
    free_dictionary_first: Option<bool>,
) -> anyhow::Result<()> {
    ctx.defer().await?;

    let reqwest_client = ctx.data().core.reqwest_client.clone();
    let wordnik_key = ctx
        .data()
        .core
        .config
        .wordnik_api_key
        .as_deref()
        .filter(|k| !k.trim().is_empty());

    // Word of the Day is only available via Wordnik
    if wotd.unwrap_or(false) {
        let key = wordnik_key.with_context(
            || "Wordnik API key is not set up in environment variables (`WORDNIK_API_KEY`).",
        )?;
        let client = WordnikClient::new(reqwest_client, key.to_string());
        let word_of_the_day = client.word_of_the_day(None).await?;
        let embed = create_wotd_message(&word_of_the_day);

        ctx.send(CreateReply::default().embed(embed)).await?;
        return Ok(());
    }

    let count = count.unwrap_or(1).clamp(1, 5);
    let prefer_free = free_dictionary_first.unwrap_or(false);
    let free_dict_client = FreeDictionaryClient::new(reqwest_client.clone());

    // Run primary provider; if it returns None, fall back to secondary
    let embed = if prefer_free {
        match fetch_free_dict(&free_dict_client, &query, count).await {
            Some(embed) => Some(embed),
            None => fetch_wordnik(reqwest_client, wordnik_key, &query, count).await,
        }
    } else {
        match fetch_wordnik(reqwest_client.clone(), wordnik_key, &query, count).await {
            Some(embed) => Some(embed),
            None => fetch_free_dict(&free_dict_client, &query, count).await,
        }
    };

    let embed = embed.context("Word definition not found. Does the word exist?")?;
    ctx.send(CreateReply::default().embed(embed)).await?;

    Ok(())
}

async fn fetch_free_dict(
    client: &FreeDictionaryClient,
    query: &str,
    count: usize,
) -> Option<CreateEmbed> {
    let responses = client.define(query).await.ok()?;
    if responses.is_empty() {
        return None;
    }

    Some(if responses.len() == 1 {
        create_free_dict_message(&responses[0], count)
    } else {
        create_free_dict_multi_message(&responses, count)
    })
}

async fn fetch_wordnik(
    reqwest_client: reqwest::Client,
    api_key: Option<&str>,
    query: &str,
    count: usize,
) -> Option<CreateEmbed> {
    let key = api_key?;
    let client = WordnikClient::new(reqwest_client, key.to_string());
    let definitions: Vec<_> = client
        .define(query, count)
        .await
        .unwrap_or_default()
        .into_iter()
        .filter(|d| d.text.is_some())
        .take(count)
        .collect();

    if definitions.is_empty() {
        return None;
    }

    Some(if definitions.len() == 1 {
        create_wordnik_message(&definitions[0])
    } else {
        create_wordnik_multi_message(&definitions)
    })
}
