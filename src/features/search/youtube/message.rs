use super::models::YouTubeSearchResult;
use crate::constants::BRAND_COLOR;
use crate::features::search::truncate;
use serenity::all::{CreateEmbed, CreateEmbedFooter};

pub fn create_youtube_message(video: &YouTubeSearchResult) -> CreateEmbed {
    let video_url = video.get_video_url().unwrap_or_default();
    let title = video.clean_title();

    let mut embed = CreateEmbed::new()
        .color(BRAND_COLOR)
        .title(title)
        .url(&video_url);

    if !video.snippet.description.trim().is_empty() {
        let desc = truncate(&video.snippet.description, 300);
        embed = embed.description(desc);
    }

    if let Some(thumb) = video.get_best_thumbnail() {
        embed = embed.image(thumb);
    }

    let published = video
        .snippet
        .published_at
        .as_deref()
        .and_then(|p| p.split('T').next())
        .unwrap_or("N/A");

    embed = embed
        .field("👤 Channel", &video.snippet.channel_title, true)
        .field("🗓️ Uploaded", published, true)
        .footer(CreateEmbedFooter::new("YouTube"));

    embed
}
