use std::io::Cursor;
use std::sync::OnceLock;
use std::time::Duration;

use anyhow::{Context as _, Result};
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD;
use image::ImageFormat;
use resvg::tiny_skia::{Pixmap, Transform};
use resvg::usvg::{Options, Tree};
use tracing::{trace, warn};

use crate::features::join_leave::types::WelcomeImageStyle;

static RESVG_OPTIONS: OnceLock<Options<'static>> = OnceLock::new();
static HTTP: OnceLock<reqwest::Client> = OnceLock::new();

const TEMPLATE: &str = include_str!("assets/welcome_template.svg");
const SCALE: f32 = 2.0;
const AVATAR_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_USERNAME_CHARS: usize = 24;
const MAX_GUILD_CHARS: usize = 32;

/// Returns `value` trimmed, or `fallback` when blank.
fn pick<'a>(value: &'a str, fallback: &'a str) -> &'a str {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        fallback
    } else {
        trimmed
    }
}

fn resvg_options() -> &'static Options<'static> {
    RESVG_OPTIONS.get_or_init(|| {
        let inter_font_bytes = include_bytes!("../leveling/assets/InterVariable.ttf");
        let jetbrains_font_bytes = include_bytes!("../leveling/assets/JetBrainsMono[wght].ttf");

        let mut opt = Options::default();
        let fontdb = opt.fontdb_mut();
        fontdb.load_font_data(jetbrains_font_bytes.to_vec());
        fontdb.load_font_data(inter_font_bytes.to_vec());
        opt.font_family = "Inter Variable".to_string();
        opt
    })
}

fn http_client() -> &'static reqwest::Client {
    HTTP.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(AVATAR_TIMEOUT)
            .build()
            .expect("reqwest client with timeout must build")
    })
}

/// Escapes user-controlled text for interpolation into the SVG template.
fn xml_escape(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            _ => out.push(c),
        }
    }
    out
}

/// Truncates to `max` chars, appending `...` when cut.
fn truncate(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        return text.to_string();
    }
    let kept: String = text.chars().take(max.saturating_sub(1)).collect();
    format!("{kept}...")
}

/// Fills the SVG template.
pub fn build_welcome_svg(
    display_name: &str,
    guild_name: &str,
    member_count: u64,
    avatar_data_uri: &str,
    style: &WelcomeImageStyle,
) -> String {
    let username = truncate(display_name, MAX_USERNAME_CHARS);
    let username_size = match username.chars().count() {
        0..=12 => 46,
        13..=18 => 36,
        _ => 28,
    };
    let defaults = WelcomeImageStyle::default();
    TEMPLATE
        .replace("{{USERNAME}}", &xml_escape(&username))
        .replace("{{USERNAME_SIZE}}", &username_size.to_string())
        .replace(
            "{{SERVER_NAME}}",
            &xml_escape(&truncate(guild_name, MAX_GUILD_CHARS)),
        )
        .replace("{{MEMBER_COUNT}}", &member_count.to_string())
        .replace("{{PROFILE_PICTURE}}", avatar_data_uri)
        .replace(
            "{{BACKGROUND_COLOR}}",
            pick(&style.background_color, &defaults.background_color),
        )
        .replace(
            "{{ACCENT_COLOR}}",
            pick(&style.accent_color, &defaults.accent_color),
        )
        .replace(
            "{{AVATAR_RING_COLOR}}",
            pick(&style.avatar_ring_color, &defaults.avatar_ring_color),
        )
        .replace(
            "{{HEADING_COLOR}}",
            pick(&style.heading_color, &defaults.heading_color),
        )
        .replace(
            "{{USERNAME_COLOR}}",
            pick(&style.username_color, &defaults.username_color),
        )
        .replace(
            "{{MEMBER_TEXT_COLOR}}",
            pick(&style.member_text_color, &defaults.member_text_color),
        )
        .replace(
            "{{ACCENT_DIAG_COLOR}}",
            pick(&style.accent_diag_color, &defaults.accent_diag_color),
        )
        .replace(
            "{{MEMBER_TEXT_COLOR}}",
            pick(&style.member_text_color, &defaults.member_text_color),
        )
        .replace(
            "{{SEPARATOR_COLOR}}",
            pick(&style.separator_color, &defaults.separator_color),
        )
}

/// Fetches an avatar URL and returns it as a PNG data URI for embedding.
async fn avatar_to_data_uri(url: &str) -> Option<String> {
    if url.trim().is_empty() {
        return None;
    }
    let bytes = http_client()
        .get(url)
        .send()
        .await
        .ok()?
        .bytes()
        .await
        .ok()?;
    let img = image::load_from_memory(&bytes).ok()?;

    let mut png_bytes = Vec::new();
    img.write_to(&mut Cursor::new(&mut png_bytes), ImageFormat::Png)
        .ok()?;

    let encoded = STANDARD.encode(&png_bytes);
    Some(format!("data:image/png;base64,{encoded}"))
}

#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn render_svg_png(svg: &str) -> Result<Vec<u8>> {
    let tree = Tree::from_str(svg, resvg_options()).context("Failed to parse welcome SVG")?;
    let size = tree.size();
    let width = (size.width() * SCALE).round() as u32;
    let height = (size.height() * SCALE).round() as u32;

    let mut pixmap = Pixmap::new(width, height).context("Failed to allocate PNG buffer")?;
    resvg::render(
        &tree,
        Transform::from_scale(SCALE, SCALE),
        &mut pixmap.as_mut(),
    );
    pixmap.encode_png().context("Failed to encode welcome PNG")
}

pub async fn generate_welcome_card(
    display_name: &str,
    avatar_url: &str,
    member_count: u64,
    guild_name: &str,
    style: &WelcomeImageStyle,
) -> Option<Vec<u8>> {
    let avatar_data_uri = avatar_to_data_uri(avatar_url).await.unwrap_or_default();
    let svg = build_welcome_svg(
        display_name,
        guild_name,
        member_count,
        &avatar_data_uri,
        style,
    );

    match tokio::task::spawn_blocking(move || render_svg_png(&svg)).await {
        Ok(Ok(bytes)) => {
            trace!(bytes = bytes.len(), "Rendered welcome card");
            Some(bytes)
        }
        Ok(Err(e)) => {
            warn!(error = ?e, "Failed to render welcome card");
            None
        }
        Err(e) => {
            warn!(error = ?e, "Welcome card render was cancelled");
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn interpolates_fields() {
        let style = WelcomeImageStyle::default();
        let svg = build_welcome_svg(
            "Spicy",
            "Fuck You",
            69420,
            "data:image/png;base64,AAA",
            &style,
        );
        assert!(svg.contains("Spicy"));
        assert!(svg.contains("Fuck You"));
        assert!(svg.contains("#69420"));
        assert!(svg.contains("data:image/png;base64,AAA"));
        assert!(svg.contains("#5865F2"));
        assert!(!svg.contains("{{"));
    }

    #[test]
    fn applies_custom_colors_and_falls_back_on_blank() {
        let style = WelcomeImageStyle {
            background_color: "#111111".to_string(),
            accent_color: "  ".to_string(),
            ..WelcomeImageStyle::default()
        };
        let svg = build_welcome_svg("Moot", "G", 1, "", &style);
        assert!(svg.contains("#111111"));
        // Blank accent falls back to the default instead of `fill=""`.
        assert!(svg.contains("#5865F2"));
        assert!(!svg.contains("{{"));
    }

    #[test]
    fn escapes_xml_and_truncates_long_names() {
        let style = WelcomeImageStyle::default();
        let svg = build_welcome_svg("<a>&\"b", "G", 1, "", &style);
        assert!(svg.contains("&lt;a&gt;&amp;&quot;b"));

        let long_name = "x".repeat(100);
        let svg = build_welcome_svg(&long_name, "G", 1, "", &style);
        assert!(svg.contains("..."));
    }

    #[test]
    fn renders_png_magic_bytes() {
        let style = WelcomeImageStyle::default();
        let svg = build_welcome_svg("Moot", "Oud Server", 7, "", &style);
        let bytes = render_svg_png(&svg).expect("render must succeed");
        assert_eq!(&bytes[0..8], &[137, 80, 78, 71, 13, 10, 26, 10]);
    }

    #[tokio::test]
    async fn async_wrapper_skips_network_on_empty_avatar() {
        let style = WelcomeImageStyle::default();
        let bytes = generate_welcome_card("Moot", "", 7, "Oud Server", &style).await;
        assert!(bytes.is_some_and(|b| !b.is_empty()));
    }
}
