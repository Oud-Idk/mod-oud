#![allow(missing_docs, clippy::unused_async)]
use crate::core::config::settings::{GuildSettings, get_settings};
use crate::features::leveling::calculation::{calculate_cumulative_xp, calculate_xp_needed};
use crate::features::leveling::database::{get_user_level, update_level};
use crate::features::leveling::{cache, database, keys};
use crate::shared::messages::send_ephemeral;
use serenity::all::{CreateAttachment, CreateEmbed, User};
use std::sync::OnceLock;
use tracing::{debug, trace};

use crate::constants::BRAND_COLOR;
use crate::core::config::state::{Context, Error};
use anyhow::Context as _;
use anyhow::Result;
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD;
use image::ImageFormat;
use resvg::tiny_skia::{Pixmap, Transform};
use resvg::usvg::{Options, Tree};
use std::io::Cursor;
use unit_prefix::NumberPrefix;

static RESVG_OPTIONS: OnceLock<Options<'static>> = OnceLock::new();

/// Leveling commands
#[poise::command(
    slash_command,
    guild_only,
    subcommands("view", "card", "add", "remove"),
    rename = "level"
)]
pub async fn level(_: Context<'_>) -> Result<(), Error> {
    // Parent command function body is never executed for slash subcommands
    Ok(())
}

/// Check your current level and experience progress as a text embed.
#[poise::command(slash_command, guild_only, rename = "view")]
pub async fn view(
    ctx: Context<'_>,
    #[description = "The user whose level you want to view"] user: Option<User>,
) -> Result<()> {
    let guild_id = ctx.guild_id().with_context(|| "Must be run in a guild")?;
    let target_user = user.as_ref().unwrap_or_else(|| ctx.author());

    let caller_id = ctx.author().id;
    let target_id = target_user.id;

    debug!(
        %caller_id,
        %target_id,
        %guild_id,
        "Invoked level view slash command"
    );

    let redis = &ctx.data().core.redis;
    let db = &ctx.data().core.db;
    let guild_configs_cache = &ctx.data().core.guild_configs_cache;

    let settings = get_settings(db, redis, guild_configs_cache, guild_id).await?;
    if !is_leveling_enabled(&settings) {
        send_ephemeral(&ctx, "Leveling isn't enabled!").await?;
        return Ok(());
    }

    let stats_key = keys::member_stats_key(guild_id, target_id);

    trace!(
        %target_id,
        key = %stats_key,
        "Retrieving level profile from database/cache"
    );

    let user_level = get_user_level(
        redis,
        db,
        guild_id,
        target_id,
        &stats_key,
        &target_user.name,
    )
    .await?;

    trace!(
        %target_id,
        level = user_level.current_level,
        xp = user_level.current_xp,
        "Successfully retrieved level metadata"
    );

    let xp_needed = calculate_xp_needed(user_level.current_level);

    let (progress_bar, percent_text) = if xp_needed > 0 {
        // Scaled to tenths of a percent (0 to 1000)
        let permille = (user_level.current_xp.saturating_mul(1000) / xp_needed).clamp(0, 1000);
        // Rounded to nearest block (+50 adds 0.5 rounding)
        let filled = usize::try_from((permille + 50) / 100).unwrap_or(0).min(10);
        let bar = format!("{}{}", "🟩".repeat(filled), "⬛".repeat(10 - filled));
        let text = format!("{}.{}%", permille / 10, permille % 10);
        (bar, text)
    } else {
        ("⬛".repeat(10), "0.0%".to_string())
    };

    let rank = database::get_user_rank(db, guild_id, target_id)
        .await?
        .map_or_else(|| "Not Available".to_string(), |r| r.to_string());

    // FORMATTING APPLIED HERE FOR EMBED (unsigned_abs() converts i64 -> u64 with 0 casts)
    let formatted_xp = format_compact(user_level.current_xp.unsigned_abs());
    let formatted_xp_needed = format_compact(xp_needed.unsigned_abs());

    let embed = CreateEmbed::new()
        .author(
            serenity::all::CreateEmbedAuthor::new(&target_user.name).icon_url(target_user.face()),
        )
        .title("Level Profile".to_string())
        .field(
            "Current Level",
            format!("🏆 **Level {}**", user_level.current_level),
            true,
        )
        .field(
            "Experience",
            format!("✨ **{formatted_xp}/{formatted_xp_needed}** XP"),
            true,
        )
        .field(
            "Progress",
            format!("{progress_bar}\n`{percent_text}`"),
            false,
        )
        .field("Rank", format!("🏅 **Rank #{rank}**"), false)
        .color(BRAND_COLOR);

    trace!(
        %target_id,
        "Dispatching response embed back to channel"
    );
    ctx.send(poise::CreateReply::default().embed(embed)).await?;

    Ok(())
}

/// Helper to handle optional/empty strings with fallbacks
fn fallback<'a>(val: &'a str, default: &'a str) -> &'a str {
    if val.trim().is_empty() { default } else { val }
}

/// Helper to format large numbers to human-readable strings (e.g., 1500 -> 1.5k)
#[allow(clippy::cast_precision_loss)]
fn format_compact(num: u64) -> String {
    match NumberPrefix::decimal(num as f64) {
        NumberPrefix::Standalone(n) => n.to_string(),
        NumberPrefix::Prefixed(prefix, n) => {
            let formatted = format!("{n:.1}");
            // Drops the .0 if it's a clean number (e.g., 1.0k becomes 1k)
            let trimmed = formatted.strip_suffix(".0").unwrap_or(&formatted);
            format!("{}{}", trimmed, prefix.symbol())
        }
    }
}

/// View your level card as a generated image.
#[poise::command(slash_command, guild_only, rename = "card")]
pub async fn card(
    ctx: Context<'_>,
    #[description = "The user whose level card you want to view"] user: Option<User>,
) -> Result<()> {
    let guild_id = ctx.guild_id().with_context(|| "Must be run in a guild")?;
    let target_user = user.as_ref().unwrap_or_else(|| ctx.author());
    let svg_template = include_str!("assets/level_template.svg");

    let redis = &ctx.data().core.redis;
    let db = &ctx.data().core.db;
    let guild_configs_cache = &ctx.data().core.guild_configs_cache;

    let settings = get_settings(db, redis, guild_configs_cache, guild_id).await?;

    if !is_leveling_enabled(&settings) {
        send_ephemeral(&ctx, "Leveling isn't enabled!").await?;
        return Ok(());
    }

    let stats_key = keys::member_stats_key(guild_id, target_user.id);

    let user_level = get_user_level(
        redis,
        db,
        guild_id,
        target_user.id,
        &stats_key,
        &target_user.name,
    )
    .await?;

    let xp_needed = calculate_xp_needed(user_level.current_level);

    let rank = database::get_user_rank(db, guild_id, target_user.id)
        .await?
        .map_or(0, i64::unsigned_abs);

    let level = user_level.current_level.unsigned_abs();
    let xp = user_level.current_xp.unsigned_abs();
    let max_xp = xp_needed.unsigned_abs();

    // Pure integer math for the progress bar (zero float casts!)
    let fill_tenths = (xp.saturating_mul(2000) + max_xp / 2)
        .checked_div(max_xp)
        .map_or(70, |w| w.clamp(70, 2000));

    let fill_width_str = format!("{}.{}", fill_tenths / 10, fill_tenths % 10);

    let Some(card) = &settings.leveling.map(|l| l.image_card) else {
        send_ephemeral(&ctx, "Image card settings not found!").await?;
        return Ok(());
    };

    let bg_color = fallback(&card.background, "#000000");
    let bar_foreground = fallback(&card.bar_foreground, "#5865F2");
    let bar_background = fallback(&card.bar_background, "#dedede");
    let line_sep = fallback(&card.line_separator, "#5865F2");
    let username_color = fallback(&card.username, "#5865F2");
    let stats_color = fallback(&card.statistics, "#5865F2");
    let accent_color = fallback(&card.accent, "#5865F2");

    let avatar_url = target_user.face();

    let profile_picture = fetch_avatar_as_base64(&avatar_url)
        .await
        .unwrap_or(avatar_url);

    let display_name = target_user
        .global_name
        .as_deref()
        .unwrap_or(&target_user.name);

    let formatted_xp = format_compact(xp);
    let formatted_max_xp = format_compact(max_xp);

    let manipulated_svg = svg_template
        .replace("fill=\"#000000\"", &format!("fill=\"{bg_color}\""))
        .replace("{{BACKGROUND_COLOR}}", bg_color)
        .replace("{{USERNAME}}", display_name)
        .replace("{{BAR.FOREGROUND}}", bar_foreground)
        .replace("{{BAR.BACKGROUND}}", bar_background)
        .replace("{{SEPARATOR}}", line_sep)
        .replace("{{PROFILE_PICTURE}}", &profile_picture)
        .replace("{{USERNAME_COLOR}}", username_color)
        .replace("{{STATISTICS}}", stats_color)
        .replace("{{ACCENT}}", accent_color)
        .replace("{{LEVEL}}", &level.to_string())
        .replace("{{XP.PROGRESS}}", &formatted_xp) // Used variable here
        .replace("{{XP.MAX}}", &formatted_max_xp) // Used variable here
        .replace("{{RANK}}", &rank.to_string())
        .replace("{{FILL_WIDTH}}", &fill_width_str);

    let png_bytes = rasterize_svg(&manipulated_svg, 2.0)?;

    let attachment = CreateAttachment::bytes(png_bytes, "level_card.png");
    ctx.send(poise::CreateReply::default().attachment(attachment))
        .await?;

    Ok(())
}

async fn fetch_avatar_as_base64(url: &str) -> Option<String> {
    let bytes = reqwest::get(url).await.ok()?.bytes().await.ok()?;
    let img = image::load_from_memory(&bytes).ok()?;

    let mut png_bytes = Vec::new();
    img.write_to(&mut Cursor::new(&mut png_bytes), ImageFormat::Png)
        .ok()?;

    let b64 = STANDARD.encode(&png_bytes);
    Some(format!("data:image/png;base64,{b64}"))
}

/// Add levels to a user (admin only).
#[poise::command(
    slash_command,
    guild_only,
    required_permissions = "MANAGE_GUILD",
    rename = "add"
)]
pub async fn add(
    ctx: Context<'_>,
    #[description = "The user to add levels to"] user: User,
    #[description = "Number of levels to add"] amount: i64,
) -> Result<()> {
    let guild_id = ctx.guild_id().with_context(|| "Must be run in a guild")?;

    if amount <= 0 {
        send_ephemeral(&ctx, "Amount must be greater than 0.").await?;
        return Ok(());
    }

    let redis = &ctx.data().core.redis;
    let db = &ctx.data().core.db;
    let guild_configs_cache = &ctx.data().core.guild_configs_cache;

    let settings = get_settings(db, redis, guild_configs_cache, guild_id).await?;
    if !is_leveling_enabled(&settings) {
        send_ephemeral(&ctx, "Leveling isn't enabled!").await?;
        return Ok(());
    }

    let stats_key = keys::member_stats_key(guild_id, user.id);
    let mut user_level =
        get_user_level(redis, db, guild_id, user.id, &stats_key, &user.name).await?;

    let old_level = user_level.current_level;

    let safe_amount = amount.min(1000);
    user_level.current_level = user_level.current_level.saturating_add(safe_amount);

    if let Some(leveling_config) = &settings.leveling
        && leveling_config.level_cap > 0
        && user_level.current_level >= leveling_config.level_cap
    {
        user_level.current_level = leveling_config.level_cap;
        user_level.current_xp = 0; // Only reset XP if they hit max level!
    }

    user_level.cumulative_xp =
        calculate_cumulative_xp(user_level.current_level, user_level.current_xp);

    update_level(db, &user_level).await?;
    let serialized = serde_json::to_string(&user_level)?;
    let _: () = cache::save_user_level_cache(redis, &stats_key, serialized).await?;

    let embed = CreateEmbed::new()
        .title("Level Added")
        .description(format!(
            "Added **{}** level(s) to **{}**.\n\nOld level: **{}**\nNew level: **{}**",
            safe_amount, user.name, old_level, user_level.current_level
        ))
        .color(BRAND_COLOR);

    ctx.send(poise::CreateReply::default().embed(embed)).await?;
    Ok(())
}

/// Remove levels from a user (admin only).
#[poise::command(
    slash_command,
    guild_only,
    required_permissions = "MANAGE_GUILD",
    rename = "remove"
)]
pub async fn remove(
    ctx: Context<'_>,
    #[description = "The user to remove levels from"] user: User,
    #[description = "Number of levels to remove"] amount: i64,
) -> Result<()> {
    let guild_id = ctx.guild_id().with_context(|| "Must be run in a guild")?;

    if amount <= 0 {
        send_ephemeral(&ctx, "Amount must be greater than 0.").await?;
        return Ok(());
    }

    let redis = &ctx.data().core.redis;
    let db = &ctx.data().core.db;
    let guild_configs_cache = &ctx.data().core.guild_configs_cache;

    let settings = get_settings(db, redis, guild_configs_cache, guild_id).await?;
    if !is_leveling_enabled(&settings) {
        send_ephemeral(&ctx, "Leveling isn't enabled!").await?;
        return Ok(());
    }

    let stats_key = keys::member_stats_key(guild_id, user.id);
    let mut user_level =
        get_user_level(redis, db, guild_id, user.id, &stats_key, &user.name).await?;

    let old_level = user_level.current_level;

    // Safe subtraction to prevent underflow panic!
    user_level.current_level = user_level.current_level.saturating_sub(amount).max(0);

    // Recalculate total XP while preserving current_xp progress within the level
    user_level.cumulative_xp =
        calculate_cumulative_xp(user_level.current_level, user_level.current_xp);

    update_level(db, &user_level).await?;
    let serialized = serde_json::to_string(&user_level)?;
    let _: () = cache::save_user_level_cache(redis, &stats_key, serialized).await?;

    let embed = CreateEmbed::new()
        .title("Level Removed")
        .description(format!(
            "Removed **{}** level(s) from **{}**.\n\nOld level: **{}**\nNew level: **{}**",
            amount, user.name, old_level, user_level.current_level
        ))
        .color(BRAND_COLOR);

    ctx.send(poise::CreateReply::default().embed(embed)).await?;
    Ok(())
}

fn get_options() -> &'static Options<'static> {
    RESVG_OPTIONS.get_or_init(|| {
        let inter_font_bytes = include_bytes!("assets/InterVariable.ttf");
        let jetbrains_font_bytes = include_bytes!("assets/JetBrainsMono[wght].ttf");

        let mut opt = Options::default();
        let fontdb = opt.fontdb_mut();

        fontdb.load_font_data(jetbrains_font_bytes.to_vec());
        fontdb.load_font_data(inter_font_bytes.to_vec());

        opt.font_family = "Inter Variable".to_string();
        opt
    })
}

/// Helper function to convert SVG string to PNG bytes using resvg
#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn rasterize_svg(svg_str: &str, scale: f32) -> Result<Vec<u8>> {
    let tree =
        Tree::from_str(svg_str, get_options()).with_context(|| "Failed to parse SVG template")?;

    let size = tree.size();

    let width = (size.width() * scale).round() as u32;
    let height = (size.height() * scale).round() as u32;

    let mut pixmap =
        Pixmap::new(width, height).with_context(|| "Failed to allocate memory for PNG image")?;

    // Render with scale matrix
    resvg::render(
        &tree,
        Transform::from_scale(scale, scale),
        &mut pixmap.as_mut(),
    );

    let png_bytes = pixmap
        .encode_png()
        .with_context(|| "Failed to encode PNG")?;

    Ok(png_bytes)
}

fn is_leveling_enabled(settings: &GuildSettings) -> bool {
    settings
        .leveling
        .as_ref()
        .is_some_and(|l| l.text.enabled || l.voice.enabled)
}
