use crate::core::config::state::{Context, Error};
use linkify::{LinkFinder, LinkKind};
use std::sync::LazyLock;

/// Shared link finder instance for URL detection.
pub static LINK_FINDER: LazyLock<LinkFinder> = LazyLock::new(LinkFinder::new);

/// Removes all URLs from `input`, returning the cleaned text and the removed URLs.
pub fn remove_urls(input: &str) -> (String, Vec<&str>) {
    let mut links_iter = LINK_FINDER.links(input).peekable();

    if links_iter.peek().is_none() {
        return (input.to_string(), Vec::new());
    }

    let mut cleaned = String::with_capacity(input.len());
    let mut urls = Vec::new();
    let mut last_pos = 0;

    for link in links_iter {
        if link.kind() == &LinkKind::Url {
            cleaned.push_str(&input[last_pos..link.start()]);
            urls.push(link.as_str());
            last_pos = link.end();
        }
    }
    cleaned.push_str(&input[last_pos..]);
    (cleaned, urls)
}

/// Sends `message` as an ephemeral reply visible only to the invoking user.
pub async fn send_ephemeral(ctx: &Context<'_>, message: impl Into<String>) -> Result<(), Error> {
    ctx.send(
        poise::CreateReply::default()
            .content(message)
            .ephemeral(true),
    )
        .await?;
    Ok(())
}