use super::models::GiphyGif;
use serenity::all::CreateEmbed;

pub fn create_giphy_message(gif: &GiphyGif, query: &str) -> CreateEmbed {
    let title = gif
        .title
        .as_deref()
        .filter(|t| !t.trim().is_empty())
        .unwrap_or(query);

    CreateEmbed::new()
        .title(title)
        .url(&gif.url)
        .image(&gif.images.original.url)
}
