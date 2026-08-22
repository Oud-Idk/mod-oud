use super::models::YouTubeSearchResult;
use crate::constants::BRAND_COLOR;
use serenity::all::{CreateEmbed, CreateEmbedFooter};

pub fn create_youtube_message(video: &YouTubeSearchResult) -> CreateEmbed {
    let video_url = video.get_video_url().unwrap_or_default();
    let title = video.clean_title();

    let mut embed = CreateEmbed::new()
        .color(BRAND_COLOR)
        .title(title)
        .url(&video_url);

    if !video.snippet.description.trim().is_empty() {
        let desc = if video.snippet.description.len() > 300 {
            format!("{}...", &video.snippet.description[..297])
        } else {
            video.snippet.description.clone()
        };
        embed = embed.description(desc);
    }

    if let Some(thumb) = video.get_best_thumbnail() {
        embed = embed.image(thumb);
    }

    // Format publish date if available (e.g. 2024-02-15)
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
