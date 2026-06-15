/// Extracts image URLs from attachments and embeds
pub fn extract_image_urls(message: &serenity::all::Message) -> Vec<String> {
    let mut urls = Vec::new();

    for attachment in &message.attachments {
        let is_image = attachment.content_type
            .as_deref()
            .map_or(false, |mime| mime.starts_with("image/"))
            || attachment.dimensions().is_some();

        if is_image {
            urls.push(attachment.url.clone());
        }
    }

    for embed in &message.embeds {
        if let Some(image) = &embed.image {
            urls.push(image.url.clone());
        }
        if let Some(thumbnail) = &embed.thumbnail {
            urls.push(thumbnail.url.clone());
        }
    }

    urls
}