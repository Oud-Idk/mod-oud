use tracing::warn;

use crate::features::join_leave::types::WelcomeImageStyle;
use crate::shared::card_engine::{fetch_avatar_data_uri, render_svg_to_png, truncate, SvgTemplate};

const WELCOME_TEMPLATE: &str = include_str!("assets/welcome_template.svg");
const LEAVE_TEMPLATE: &str = include_str!("assets/leave_template.svg");
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

/// Fills the SVG template.
pub fn build_join_leave_svg(
    template: &str,
    display_name: &str,
    guild_name: &str,
    member_count: u64,
    avatar_data_uri: &str,
    style: &WelcomeImageStyle,
) -> String {
    let username = truncate(display_name, MAX_USERNAME_CHARS);
    let guild_name = truncate(guild_name, MAX_GUILD_CHARS);

    let username_size = match username.chars().count() {
        0..=12 => 46,
        13..=18 => 36,
        _ => 28,
    };

    SvgTemplate::new(template)
        .set_text("USERNAME", &username)
        .set_text("SERVER_NAME", &guild_name)
        .set_raw("USERNAME_SIZE", username_size)
        .set_raw("MEMBER_COUNT", member_count)
        .set_raw("PROFILE_PICTURE", avatar_data_uri)
        .set_raw("BACKGROUND_COLOR", &style.background_color)
        .set_raw("ACCENT_COLOR", &style.accent_color)
        .set_raw("AVATAR_RING_COLOR", &style.avatar_ring_color)
        .set_raw("HEADING_COLOR", &style.heading_color)
        .set_raw("USERNAME_COLOR", &style.username_color)
        .set_raw("MEMBER_TEXT_COLOR", &style.member_text_color)
        .set_raw("ACCENT_DIAG_COLOR", &style.accent_diag_color)
        .set_raw("SEPARATOR_COLOR", &style.separator_color)
        .render()
}

pub async fn generate_welcome_card(
    display_name: &str,
    avatar_url: &str,
    member_count: u64,
    guild_name: &str,
    style: &WelcomeImageStyle,
) -> Option<Vec<u8>> {
    let avatar_data_uri = fetch_avatar_data_uri(avatar_url).await.unwrap_or_default();
    let svg = build_join_leave_svg(WELCOME_TEMPLATE, display_name, guild_name, member_count, &avatar_data_uri, style);

    match render_svg_to_png(svg, 2.0).await {
        Ok(bytes) => Some(bytes),
        Err(e) => {
            warn!(error = ?e, "Failed to render welcome card");
            None
        }
    }
}

pub async fn generate_leave_card(
    display_name: &str,
    avatar_url: &str,
    member_count: u64,
    guild_name: &str,
    style: &WelcomeImageStyle,
) -> Option<Vec<u8>> {
    let avatar_data_uri = fetch_avatar_data_uri(avatar_url).await.unwrap_or_default();

    let svg = build_join_leave_svg(
        LEAVE_TEMPLATE,
        display_name,
        guild_name,
        member_count,
        &avatar_data_uri,
        style,
    );

    match render_svg_to_png(svg, 2.0).await {
        Ok(bytes) => Some(bytes),
        Err(e) => {
            tracing::warn!(error = ?e, "Failed to render leave card");
            None
        }
    }
}