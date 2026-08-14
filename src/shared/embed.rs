use crate::core::config::state::Error;
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use serenity::all::{CreateEmbed, CreateMessage};
use tracing::warn;

/// The output format of a configurable message: a Discord embed or plain text.
#[derive(Serialize, Deserialize, Debug, Clone, Default, sqlx::Type, PartialEq, Eq, Copy)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[sqlx(type_name = "message_format", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Format {
    /// The message is rendered as a Discord embed.
    #[default]
    Embed,
    /// The message is rendered as plain text content.
    Text,
}

/// A thumbnail image shown in the top-right corner of the embed.
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
pub struct EmbedThumbnail {
    /// URL of the thumbnail image.
    #[serde(alias = "thumbnailUrl")]
    pub url: String,
}

/// A large image shown at the bottom of the embed.
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
pub struct EmbedImage {
    /// URL of the image.
    #[serde(alias = "imageUrl")]
    pub url: String,
}

/// The author line at the top of the embed.
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
pub struct EmbedAuthor {
    /// Name shown as the author.
    pub name: Option<String>,
    /// URL of the author's icon.
    #[serde(alias = "authorIcon")]
    pub icon_url: Option<String>,
}

/// The footer line at the bottom of the embed.
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
pub struct EmbedFooter {
    /// Footer text.
    pub text: Option<String>,
    /// URL of the footer's icon.
    #[serde(alias = "footerIcon")]
    pub icon_url: Option<String>,
}

/// A fully configurable Discord embed, mirroring the dashboard's JSONB schema.
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
pub struct DiscordEmbed {
    /// Embed title.
    pub title: Option<String>,
    /// Embed description.
    pub description: Option<String>,
    /// Embed accent color as an RGB value.
    pub color: Option<u32>,
    /// Thumbnail image, if any.
    pub thumbnail: Option<EmbedThumbnail>,
    /// Large bottom image, if any.
    pub image: Option<EmbedImage>,
    /// Author line, if any.
    pub author: Option<EmbedAuthor>,
    /// Footer line, if any.
    pub footer: Option<EmbedFooter>,
}

impl MessageGetter for DiscordEmbed {
    fn content(&self) -> &'static str {
        "Fuck you SpicyWolf"
    }

    fn embed(&self) -> &DiscordEmbed {
        self
    }

    fn format(&self) -> Format {
        Format::Embed
    }
}

/// A blank embed with every field empty.
pub static DEFAULT_EMBED: DiscordEmbed = DiscordEmbed {
    title: None,
    description: None,
    color: None,
    thumbnail: None,
    image: None,
    author: None,
    footer: None,
};

impl DiscordEmbed {
    /// Returns `true` if the embed has no title, description, color, thumbnail,
    /// image, author, or footer that would render any visible content.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.title.as_deref().unwrap_or("").trim().is_empty()
            && self.description.as_deref().unwrap_or("").trim().is_empty()
            && self.color.is_none()
            && self.thumbnail.as_ref().is_none_or(|t| t.url.trim().is_empty())
            && self.image.as_ref().is_none_or(|i| i.url.trim().is_empty())
            && self.author.as_ref().is_none_or(|a| a.name.as_deref().unwrap_or("").trim().is_empty())
            && self.footer.as_ref().is_none_or(|f| f.text.as_deref().unwrap_or("").trim().is_empty())
    }

    /// Builds a serenity `CreateEmbed` using a custom placeholder replacement function.
    pub fn to_embed<F>(&self, mut replace: F) -> Result<CreateEmbed, anyhow::Error>
    where
        F: FnMut(&str) -> String,
    {
        if self.is_empty() {
            anyhow::bail!("Cannot build Discord embed: embed has no title, description, or fields.");
        }

        let mut embed = CreateEmbed::new();

        if let Some(ref title) = self.title {
            let t = replace(title);
            if !t.trim().is_empty() {
                embed = embed.title(t);
            }
        }
        if let Some(ref description) = self.description {
            let d = replace(description);
            if !d.trim().is_empty() {
                embed = embed.description(d);
            }
        }
        if let Some(color) = self.color {
            embed = embed.color(serenity::all::Color::new(color));
        }
        if let Some(ref thumbnail) = self.thumbnail {
            let url = replace(&thumbnail.url);
            if !url.trim().is_empty() {
                embed = embed.thumbnail(url);
            }
        }
        if let Some(ref image) = self.image {
            let url = replace(&image.url);
            if !url.trim().is_empty() {
                embed = embed.image(url);
            }
        }
        if let Some(ref author) = self.author {
            let name = replace(author.name.as_deref().unwrap_or(""));
            if !name.trim().is_empty() {
                let mut a = serenity::all::CreateEmbedAuthor::new(name);
                if let Some(ref url) = author.icon_url {
                    let u = replace(url);
                    if !u.trim().is_empty() {
                        a = a.icon_url(u);
                    }
                }
                embed = embed.author(a);
            }
        }
        if let Some(ref footer) = self.footer {
            let text = replace(footer.text.as_deref().unwrap_or(""));
            if !text.trim().is_empty() {
                let mut f = serenity::all::CreateEmbedFooter::new(text);
                if let Some(ref url) = footer.icon_url {
                    let u = replace(url);
                    if !u.trim().is_empty() {
                        f = f.icon_url(u);
                    }
                }
                embed = embed.footer(f);
            }
        }

        Ok(embed)
    }
}

/// Types that can render themselves as a Discord message (content, embed, or both).
pub trait MessageGetter {
    /// The plain-text content of the message.
    fn content(&self) -> &str;
    /// The embed template of the message.
    fn embed(&self) -> &DiscordEmbed;
    /// The format the message should be rendered as.
    fn format(&self) -> Format;
}

/// Builds a `CreateMessage` from a format, content, and embed template, applying
/// `replace_fn` to every placeholder. Returns `None` if nothing would be rendered.
pub fn build_custom_message<F>(
    format: Format,
    content: &str,
    embed_template: &DiscordEmbed,
    replace_fn: F,
) -> Result<Option<CreateMessage>, Error>
where
    F: Fn(&str) -> String,
{
    let mut builder = CreateMessage::new();
    let mut has_payload = false;

    match format {
        Format::Text => {
            let text = replace_fn(content);
            if !text.trim().is_empty() {
                builder = builder.content(text);
                has_payload = true;
            }
        }
        Format::Embed => {
            if !embed_template.is_empty() {
                let embed = embed_template.to_embed(replace_fn)?;
                builder = builder.embed(embed);
                has_payload = true;
            }
        }
    }

    Ok(if has_payload { Some(builder) } else { None })
}

/// Builds a message from any [`MessageGetter`] payload, applying `replace_fn` to
/// placeholders. Returns `None` if the payload renders to nothing.
pub fn create_basic_embed<T, F>(payload: &T, replace_fn: F) -> Result<Option<CreateMessage>, Error>
where
    T: MessageGetter,
    F: Fn(&str) -> String,
{
    build_custom_message(
        payload.format(),
        payload.content(),
        payload.embed(),
        replace_fn,
    )
}

/// Like [`create_basic_embed`] but returns an HTTP-friendly error for the
/// dashboard when the payload would render to an empty message or fails to compile.
pub fn create_embed_for_web<T, F>(payload: &T, replace_fn: F) -> Result<CreateMessage, (StatusCode, String)>
where
    T: MessageGetter,
    F: Fn(&str) -> String,
{
    match create_basic_embed(payload, replace_fn) {
        Ok(Some(builder)) => Ok(builder),
        Ok(None) => Err((
            StatusCode::BAD_REQUEST,
            "Cannot send an empty message. Please provide either text content or a populated embed.".to_string(),
        )),
        Err(e) => {
            warn!(error = ?e, "Failed to parse custom embed format");
            Err((
                StatusCode::BAD_REQUEST,
                format!("Failed to compile embed: {e}"),
            ))
        }
    }
}

