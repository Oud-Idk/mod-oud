use super::models::{TmdbDetail, TmdbMediaType};
use crate::constants::BRAND_COLOR;
use serenity::all::CreateEmbed;
use std::fmt::Write;

pub fn create_tmdb_message(
    detail: &TmdbDetail,
    media_type: TmdbMediaType,
    top_result_id: u64,
) -> CreateEmbed {
    let mut description = String::new();
    if let Some(tagline) = detail.tagline() {
        let _ = write!(description, "*{tagline}*\n\n");
    }
    if let Some(overview) = detail.overview() {
        description.push_str(overview);
    }

    let mut embed = CreateEmbed::new()
        .title(format!("[{}] {}", media_type.name(), detail.title()))
        .url(TmdbDetail::web_url(media_type, top_result_id))
        .color(BRAND_COLOR)
        .description(description);

    if let Some(poster) = detail.poster_url() {
        embed = embed.thumbnail(poster);
    }

    embed = embed.field("Genres", detail.genres(), true);

    if let Some(release_info) = detail.release_info() {
        embed = embed.field("Released", release_info, true);
    }
    if let Some(runtime) = detail.runtime_display() {
        embed = embed.field("Runtime", runtime, true);
    }
    if let Some(rating) = detail.rating_display() {
        embed = embed.field("Rating", rating, true);
    }
    if let Some(status) = detail.status() {
        embed = embed.field("Status", status, true);
    }
    if let Some(creators) = detail.directors_or_creators() {
        let title = match media_type {
            TmdbMediaType::Movie => "Director",
            TmdbMediaType::Tv => "Creator(s)",
        };
        embed = embed.field(title, creators, true);
    }
    if let Some(cast) = detail.top_cast(4) {
        embed = embed.field("Starring", cast, false);
    }
    if let Some(trailer) = detail.trailer_url() {
        embed = embed.field("Trailer", format!("[Watch on YouTube]({trailer})"), false);
    }

    embed
}
