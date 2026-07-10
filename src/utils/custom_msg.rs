use crate::types::embed::DiscordEmbed;
use crate::types::Error;
use serenity::builder::CreateMessage;

/// A generic builder that takes your templates and a placeholder replacement closure.
pub fn build_custom_message<F>(
    is_embed: bool,
    content: Option<&str>,
    embed_template: Option<&DiscordEmbed>,
    replace_fn: F,
) -> Result<Option<CreateMessage>, Error>
where
    F: Fn(&str) -> String,
{
    let mut builder = CreateMessage::new();
    let mut has_payload = false;

    if !is_embed {
        if let Some(text) = content {
            builder = builder.content(replace_fn(text));
            has_payload = true;
        }
    } else {
        if let Some(custom_embed) = embed_template {
            if !custom_embed.is_empty() {
                let embed = custom_embed.to_embed(replace_fn)?;
                builder = builder.embed(embed);
                has_payload = true;
            }
        }
    }

    Ok(if has_payload { Some(builder) } else { None })
}