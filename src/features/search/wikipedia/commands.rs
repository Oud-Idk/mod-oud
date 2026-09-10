use crate::core::config::state::Context;
use crate::features::search::wikipedia;
use crate::features::search::wikipedia::message::create_wikipedia_message;
use poise::CreateReply;

/// Searches Wikipedia for a summary about a topic.
#[poise::command(slash_command)]
pub async fn wikipedia(
    ctx: Context<'_>,
    #[description = "Your query"] query: String,
) -> anyhow::Result<()> {
    ctx.defer().await?;
    let reqwest_client = ctx.data().core.reqwest_client.clone();
    let client = wikipedia::client::WikipediaClient::new(reqwest_client);

    match client.get_or_search(&query).await? {
        Some(summary) => {
            let embed = create_wikipedia_message(&summary);
            let reply = CreateReply::default().embed(embed);
            ctx.send(reply).await?;
        }
        None => {
            ctx.say(format!("No Wikipedia article found for **`{query}`**!"))
                .await?;
        }
    }

    Ok(())
}