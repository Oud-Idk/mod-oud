use anyhow::Context as _;
use crate::core::config::state::Context;
use crate::features::search::genius::client::GeniusClient;

fn chunk_message(text: &str, max_len: usize) -> Vec<String> {
    let mut blocks: Vec<String> = Vec::new();
    let mut current_block = String::new();

    for line in text.lines() {
        if line.starts_with('#') && !current_block.trim().is_empty() {
            blocks.push(current_block.trim_end().to_string());
            current_block.clear();
        }
        current_block.push_str(line);
        current_block.push('\n');
    }
    if !current_block.trim().is_empty() {
        blocks.push(current_block.trim_end().to_string());
    }

    let mut chunks = Vec::new();
    let mut current_chunk = String::new();

    for block in blocks {
        if block.len() > max_len {
            if !current_chunk.is_empty() {
                chunks.push(current_chunk.trim_end().to_string());
                current_chunk.clear();
            }
            for line in block.lines() {
                if current_chunk.len() + line.len() + 1 > max_len {
                    chunks.push(current_chunk.trim_end().to_string());
                    current_chunk.clear();
                }
                current_chunk.push_str(line);
                current_chunk.push('\n');
            }
            continue;
        }

        let extra_space = usize::from(!current_chunk.is_empty());
        if current_chunk.len() + extra_space + block.len() > max_len
            && !current_chunk.is_empty() {
            chunks.push(current_chunk.trim_end().to_string());
            current_chunk.clear();
        }

        if !current_chunk.is_empty() {
            current_chunk.push('\n');
        }
        current_chunk.push_str(&block);
    }

    if !current_chunk.trim().is_empty() {
        chunks.push(current_chunk.trim_end().to_string());
    }

    chunks
}

/// Searches a lyrics for a song from Genius.
#[poise::command(slash_command)]
pub async fn genius(
    ctx: Context<'_>,
    #[description = "The Query"] query: String,
) -> anyhow::Result<()> {
    ctx.defer().await?;
    let reqwest_client = ctx.data().core.reqwest_client.clone();
    let api_key = ctx
        .data()
        .core
        .config
        .genius_api_key
        .as_deref()
        .with_context(
            || "Genius API key is not set up. Please contact the hoster of the bot to set it up.",
        )?;
    let client = GeniusClient::new(api_key, reqwest_client);
    let Some(output) = client.search_lyrics_for_discord(&query).await? else {
        ctx.say(format!("Lyrics not found for query `{query}`.")).await?;
        return Ok(());
    };

    let chunks = chunk_message(&output, 1900);

    if let Some(first) = chunks.first() {
        ctx.say(first).await?;
    }

    for chunk in chunks.iter().skip(1) {
        ctx.send(poise::CreateReply::default().content(chunk)).await?;
    }

    Ok(())
}