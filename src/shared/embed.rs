use crate::{Context, Error};
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use serenity::all::{CreateEmbed, CreateMessage};
use tracing::warn;

#[derive(Serialize, Deserialize, Debug, Clone, Default, sqlx::Type, PartialEq, Copy)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[sqlx(type_name = "message_format", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Format {
    #[default]
    Embed,
    Text,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
pub struct EmbedThumbnail {
    #[serde(alias = "thumbnailUrl")]
    pub url: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
pub struct EmbedImage {
    #[serde(alias = "imageUrl")]
    pub url: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
pub struct EmbedAuthor {
    pub name: Option<String>,
    #[serde(alias = "authorIcon")]
    pub icon_url: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
pub struct EmbedFooter {
    pub text: Option<String>,
    #[serde(alias = "footerIcon")]
    pub icon_url: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
pub struct DiscordEmbed {
    pub title: Option<String>,
    pub description: Option<String>,
    pub color: Option<u32>,
    pub thumbnail: Option<EmbedThumbnail>,
    pub image: Option<EmbedImage>,
    pub author: Option<EmbedAuthor>,
    pub footer: Option<EmbedFooter>,
}

impl DiscordEmbed {
    pub fn is_empty(&self) -> bool {
        self.title.is_none()
            && self.description.is_none()
            && self.color.is_none()
            && self.thumbnail.is_none()
            && self.image.is_none()
            && self.author.is_none()
            && self.footer.is_none()
    }

    /// Builds a serenity CreateEmbed using a custom placeholder replacement function.
    pub fn to_embed<F>(&self, mut replace: F) -> Result<CreateEmbed, anyhow::Error>
    where
        F: FnMut(&str) -> String,
    {
        let mut embed = CreateEmbed::new();

        if let Some(ref title) = self.title {
            embed = embed.title(replace(title));
        }
        if let Some(ref description) = self.description {
            embed = embed.description(replace(description));
        }
        if let Some(color) = self.color {
            embed = embed.color(serenity::all::Color::new(color));
        }
        if let Some(ref thumbnail) = self.thumbnail {
            embed = embed.thumbnail(replace(&thumbnail.url));
        }
        if let Some(ref image) = self.image {
            embed = embed.image(replace(&image.url));
        }
        if let Some(ref author) = self.author {
            let author_name = replace(author.name.as_deref().unwrap_or(""));
            let mut a = serenity::all::CreateEmbedAuthor::new(author_name);
            if let Some(ref url) = author.icon_url {
                a = a.icon_url(replace(url));
            }
            embed = embed.author(a);
        }
        if let Some(ref footer) = self.footer {
            let footer_text = replace(footer.text.as_deref().unwrap_or(""));
            let mut f = serenity::all::CreateEmbedFooter::new(footer_text);
            if let Some(ref url) = footer.icon_url {
                f = f.icon_url(replace(url));
            }
            embed = embed.footer(f);
        }

        Ok(embed)
    }
}

/// A generic builder that takes your templates and a placeholder replacement closure.
pub fn build_custom_message<F>(
    format: &Format,
    content: Option<&str>,
    embed_template: Option<&DiscordEmbed>,
    replace_fn: F,
) -> Result<Option<CreateMessage>, Error>
where
    F: Fn(&str) -> String,
{
    let mut builder = CreateMessage::new();
    let mut has_payload = false;

    if matches!(format, Format::Text) {
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

/// Sends a simple ephemeral reply back to the user.
pub async fn send_ephemeral(ctx: &Context<'_>, message: impl Into<String>) -> Result<(), Error> {
    ctx.send(
        poise::CreateReply::default()
            .content(message)
            .ephemeral(true),
    )
        .await?;
    Ok(())
}

pub trait EmbedGetters {
    fn content(&self) -> Option<&str>;
    fn embed(&self) -> Option<&DiscordEmbed>;
    fn format(&self) -> Option<&Format>;
}

pub fn create_basic_embed<T, F>(payload: &T, replace_fn: Option<F>) -> Result<Option<CreateMessage>, Error>
where
    T: EmbedGetters,
    F: Fn(&str) -> String
{
    fn default_replace_fn(text: &str) -> String {
        text.to_string()
    }

    build_custom_message(
        payload.format().unwrap_or(&Format::Embed),
        payload.content(),
        payload.embed(),
        |text| {
            match &replace_fn {
                Some(f) => f(text),
                None => default_replace_fn(text),
            }
        }
    )
}

pub fn create_embed_for_web<T, F>(payload: &T, replace_fn: Option<F>) -> Result<CreateMessage, (StatusCode, String)>
where
    T: EmbedGetters,
    F: Fn(&str) -> String
{
    Ok(
        match create_basic_embed(payload, replace_fn) {
            Ok(Some(builder)) => builder,
            Ok(None) => {
                return Err((
                    StatusCode::BAD_REQUEST,
                    "Cannot send an empty message. Please provide either text content or a populated embed.".to_string(),
                ));
            }
            Err(e) => {
                warn!(error = ?e, "Failed to parse custom embed format");
                return Err((
                    StatusCode::BAD_REQUEST,
                    format!("Failed to compile embed: {}", e),
                ));
            }
        }
    )
}