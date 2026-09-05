use crate::core::config::state::Context;
use anyhow::Context as _;
use poise::CreateReply;

use crate::features::search::wordnik::client::WordnikClient;
use crate::features::search::wordnik::message::{
    create_wordnik_message, create_wordnik_multi_message, create_wotd_message,
};

/// Searches Wordnik for a word or phrase definition.
#[poise::command(slash_command)]
pub async fn wordnik(
    ctx: Context<'_>,
    #[description = "Word or phrase to define"] query: String,
    #[description = "Whether to take the Word of The Day"] wotd: Option<bool>,
    #[description = "Number of definitions to show (1–5, default 1)"] count: Option<usize>,
) -> anyhow::Result<()> {
    ctx.defer().await?;
    let reqwest_client = ctx.data().core.reqwest_client.clone();
    let api_key = ctx
        .data()
        .core
        .config
        .wordnik_api_key
        .as_deref()
        .filter(|k| !k.trim().is_empty())
        .with_context(
            || "Wordnik API key is not set up in environment variables (`Wordnik_API_KEY`).",
        )?
        .into();
    let client = WordnikClient::new(reqwest_client, api_key);

    let wotd = wotd.unwrap_or(false);
    if wotd {
        let word_of_the_day = client.word_of_the_day(None).await?;
        let embed = create_wotd_message(&word_of_the_day);
        let reply = CreateReply::default().embed(embed);
        ctx.send(reply).await?;
    } else {
        let count = count.unwrap_or(1).clamp(1, 5);
        let definitions = client
            .define(&query, count)
            .await?
            .into_iter()
            .take(count)
            .collect::<Vec<_>>();
        anyhow::ensure!(
            !definitions.is_empty(),
            "Word definition not found. Does the word exist?"
        );

        let embed = if definitions.len() == 1 {
            create_wordnik_message(&definitions[0])
        } else {
            create_wordnik_multi_message(&definitions)
        };

        let reply = CreateReply::default().embed(embed);
        ctx.send(reply).await?;
    }

    Ok(())
}
