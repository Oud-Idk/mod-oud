use aho_corasick::AhoCorasick;
use anyhow::{Context as _, Result};
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD;
use image::ImageFormat;
use resvg::tiny_skia::{Pixmap, Transform};
use resvg::usvg::{Options, Tree};
use std::io::Cursor;
use std::sync::OnceLock;
use std::time::Duration;

static RESVG_OPTIONS: OnceLock<Options<'static>> = OnceLock::new();
static HTTP: OnceLock<reqwest::Client> = OnceLock::new();

const AVATAR_TIMEOUT: Duration = Duration::from_secs(5);

/// Get the shared HTTP client with sensible timeouts
fn http_client() -> &'static reqwest::Client {
    HTTP.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(AVATAR_TIMEOUT)
            .build()
            .expect("Reqwest client failed to initialize")
    })
}

/// Global Resvg options with fonts baked in
pub fn resvg_options() -> &'static Options<'static> {
    RESVG_OPTIONS.get_or_init(|| {
        let inter_bytes = include_bytes!("./assets/InterVariable.ttf");
        let jetbrains_bytes = include_bytes!("./assets/JetBrainsMono[wght].ttf");

        let mut opt = Options::default();
        let fontdb = opt.fontdb_mut();
        fontdb.load_font_data(jetbrains_bytes.to_vec());
        fontdb.load_font_data(inter_bytes.to_vec());
        opt.font_family = "Inter Variable".to_string();
        opt
    })
}

/// Safe XML escaping so users named `<script>` don't break your SVGs
#[must_use]
pub fn xml_escape(text: &str) -> String {
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

/// Truncates string gracefully with ellipsis
#[must_use]
pub fn truncate(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        return text.to_string();
    }
    let kept: String = text.chars().take(max.saturating_sub(1)).collect();
    format!("{kept}...")
}

/// Returns value if not blank, otherwise fallback
#[must_use]
pub fn fallback<'a>(val: &'a str, default: &'a str) -> &'a str {
    let trimmed = val.trim();
    if trimmed.is_empty() { default } else { trimmed }
}

// --- Network & Rendering ---

/// Fetches an image URL and turns it into an SVG-ready Base64 Data URI
pub async fn fetch_avatar_data_uri(url: &str) -> Option<String> {
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

/// Renders raw SVG string to PNG bytes on a blocking worker thread
///
/// # Errors
/// Returns `Err` if SVG is invalid, PNG allocation failed, or PNG encoding failed.
#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
pub async fn render_svg_to_png(svg: String, scale: f32) -> Result<Vec<u8>> {
    tokio::task::spawn_blocking(move || {
        let tree = Tree::from_str(&svg, resvg_options()).context("Failed to parse SVG template")?;
        let size = tree.size();
        let width = (size.width() * scale).round() as u32;
        let height = (size.height() * scale).round() as u32;

        let mut pixmap = Pixmap::new(width, height).context("Failed to allocate PNG buffer")?;
        resvg::render(
            &tree,
            Transform::from_scale(scale, scale),
            &mut pixmap.as_mut(),
        );

        pixmap.encode_png().context("Failed to encode PNG")
    })
    .await
    .context("Render task was cancelled")?
}

/// An SVG template system.
pub struct SvgTemplate<'a> {
    template: &'a str,
    patterns: Vec<String>,
    replacements: Vec<String>,
}

impl<'a> SvgTemplate<'a> {
    /// Creates a new SVG template object.
    #[must_use]
    pub fn new(template: &'a str) -> Self {
        Self {
            template,
            patterns: Vec::with_capacity(16),
            replacements: Vec::with_capacity(16),
        }
    }

    /// User-controlled text that MUST be XML-escaped (e.g., usernames, server names)
    #[must_use]
    pub fn set_text(mut self, key: impl std::fmt::Display, value: &str) -> Self {
        self.patterns.push(format!("{{{{{key}}}}}"));
        self.replacements.push(xml_escape(value));
        self
    }

    /// Raw / trusted text that shouldn't be escaped (hex colors, base64 data URIs, numbers)
    #[must_use]
    pub fn set_raw(mut self, key: impl std::fmt::Display, value: impl std::fmt::Display) -> Self {
        self.patterns.push(format!("{{{{{key}}}}}"));
        self.replacements.push(value.to_string());
        self
    }

    /// Match all keys simultaneously in a single pass!
    ///
    /// # Panics
    /// Will not panic from a string of patterns.
    pub fn render(self) -> String {
        if self.patterns.is_empty() {
            return self.template.to_string();
        }

        let ac = AhoCorasick::new(&self.patterns)
            .expect("SvgTemplate pattern compilation should never fail");

        let replacement_refs: Vec<&str> = self.replacements.iter().map(AsRef::as_ref).collect();

        ac.replace_all(self.template, &replacement_refs)
    }
}
