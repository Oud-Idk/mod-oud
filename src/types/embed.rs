use crate::core::config;
use crate::core::config::GuildCtx;
use crate::types::types::Error;
use serde::{Deserialize, Serialize};
use serenity::all::CreateEmbed;

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)] // If a field is missing in JSON, use the Default impl
pub struct EmbedThumbnail {
    #[serde(alias = "thumbnailUrl")] // Graceful fallback for flat keys
    pub url: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
pub struct EmbedImage {
    #[serde(alias = "imageUrl")]     // Graceful fallback for flat keys
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

    pub fn to_create_embed_with_ctx(
        &self,
        member: &serenity::all::Member,
        channel: &serenity::all::GuildChannel,
        gctx: &GuildCtx,
        plan_name: Option<&str>,
        achievement: Option<&str>,
    ) -> Result<CreateEmbed, Error> {
        let mut embed = CreateEmbed::new();

        if let Some(ref title) = self.title {
            embed = embed.title(config::replace_placeholders(title, gctx, member, channel, plan_name, achievement));
        }
        if let Some(ref description) = self.description {
            embed = embed.description(config::replace_placeholders(description, gctx, member, channel, plan_name, achievement));
        }
        if let Some(color) = self.color {
            embed = embed.color(serenity::all::Color::new(color));
        }
        if let Some(ref thumbnail) = self.thumbnail {
            embed = embed.thumbnail(config::replace_placeholders(&thumbnail.url, gctx, member, channel, plan_name, achievement));
        }
        if let Some(ref image) = self.image {
            embed = embed.image(config::replace_placeholders(&image.url, gctx, member, channel, plan_name, achievement));
        }
        if let Some(ref author) = self.author {
            let mut a = serenity::all::CreateEmbedAuthor::new(
                config::replace_placeholders(author.name.as_deref().unwrap_or(""), gctx, member, channel, plan_name, achievement),
            );
            if let Some(ref url) = author.icon_url {
                a = a.icon_url(config::replace_placeholders(url, gctx, member, channel, plan_name, achievement));
            }
            embed = embed.author(a);
        }
        if let Some(ref footer) = self.footer {
            let mut f = serenity::all::CreateEmbedFooter::new(
                config::replace_placeholders(footer.text.as_deref().unwrap_or(""), gctx, member, channel, plan_name, achievement),
            );
            if let Some(ref url) = footer.icon_url {
                f = f.icon_url(config::replace_placeholders(url, gctx, member, channel, plan_name, achievement));
            }
            embed = embed.footer(f);
        }

        Ok(embed)
    }
}