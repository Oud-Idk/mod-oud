use std::sync::OnceLock;
use crate::features::leveling::calculation::{calculate_cumulative_xp, calculate_xp_needed};
use crate::features::leveling::database::{get_user_level, update_level};
use crate::features::leveling::{cache, database, keys};
use crate::features::leveling::types::UserLevel;
use crate::{Data, Error};
use serenity::all::{CreateAttachment, CreateEmbed, GuildId, User, UserId};
use tracing::{debug, trace};
use crate::core::config::settings::{get_settings, GuildSettings};
use crate::shared::embed::send_ephemeral;

use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use resvg::tiny_skia::{Pixmap, Transform};
use resvg::usvg::{fontdb, Options, Tree};
use unit_prefix::NumberPrefix;
use std::io::Cursor;
use image::ImageFormat;

static RESVG_OPTIONS: OnceLock<Options<'static>> = OnceLock::new();

/// Leveling commands
#[poise::command(
    slash_command,
    guild_only,
    subcommands("view", "card", "add", "remove"),
    rename = "level"
)]
pub async fn level(_: poise::Context<'_, Data, Error>) -> Result<(), Error> {
    // Parent command function body is never executed for slash subcommands
    Ok(())
}

/// Check your current level and experience progress as a text embed.
#[poise::command(slash_command, guild_only, rename = "view")]
pub async fn view(
    ctx: poise::Context<'_, Data, Error>,
    #[description = "The user whose level you want to view"] user: Option<User>,
) -> Result<(), Error> {
    let guild_id = ctx.guild_id().ok_or("This command can only be used inside a server.")?;
    let target_user = user.as_ref().unwrap_or(ctx.author());

    let caller_id = ctx.author().id.get();
    let target_id = target_user.id;
    let target_id_u64 = target_id.get();
    let guild_id_u64 = guild_id.get();

    debug!(
        caller_id,
        target_id = target_id_u64,
        guild_id = guild_id_u64,
        "Invoked level view slash command"
    );

    let redis = &ctx.data().redis;
    let db = &ctx.data().db;
    let guild_configs_cache = &ctx.data().guild_configs;

    let settings = get_settings(db, redis, guild_configs_cache, guild_id.get() as i64).await?;
    if !is_leveling_enabled(&settings) {
        send_ephemeral(&ctx, "Leveling isn't enabled!").await?;
        return Ok(())
    }

    let stats_key = keys::member_stats_key(&guild_id, target_id);

    trace!(
        target_id = target_id_u64,
        key = %stats_key,
        "Retrieving level profile from database/cache"
    );

    let user_level = get_user_level(
        redis,
        db,
        &guild_id,
        &target_id,
        &stats_key,
        &target_user.name,
    ).await?;

    trace!(
        target_id = target_id_u64,
        level = user_level.current_level,
        xp = user_level.current_xp,
        "Successfully retrieved level metadata"
    );

    let xp_needed = calculate_xp_needed(user_level.current_level);

    let progress_percentage = if xp_needed > 0 {
        (user_level.current_xp as f32 / xp_needed as f32).clamp(0.0, 1.0)
    } else {
        0.0
    };
    let filled_blocks = (progress_percentage * 10.0).round() as usize;
    let empty_blocks = 10 - filled_blocks;
    let progress_bar = format!(
        "{}{}",
        "🟩".repeat(filled_blocks),
        "⬛".repeat(empty_blocks)
    );

    let rank = database::get_user_rank(
        db,
        guild_id.get() as i64,
        target_id.get() as i64,
        user_level.current_level,
        user_level.current_xp
    ).await?.map(|r| r.to_string()).unwrap_or("Not Available".to_string());

    // 👇 FORMATTING APPLIED HERE FOR EMBED
    let formatted_xp = format_compact(user_level.current_xp as u64);
    let formatted_xp_needed = format_compact(xp_needed as u64);

    let embed = CreateEmbed::new()
        .author(
            serenity::all::CreateEmbedAuthor::new(&target_user.name)
                .icon_url(target_user.face()),
        )
        .title("Level Profile".to_string())
        .field("Current Level", format!("🏆 **Level {}**", user_level.current_level), true)
        .field("Experience", format!("✨ **{}/{}** XP", formatted_xp, formatted_xp_needed), true)
        .field("Progress", format!("{}\n`{:.1}%`", progress_bar, progress_percentage * 100.0), false)
        .field("Rank", format!("🏅 **Rank #{}**", rank), false)
        .color(0x5865F2);

    trace!(target_id = target_id_u64, "Dispatching response embed back to channel");
    ctx.send(poise::CreateReply::default().embed(embed)).await?;

    Ok(())
}

/// Helper to handle optional/empty strings with fallbacks
fn fallback<'a>(val: &'a str, default: &'a str) -> &'a str {
    if val.trim().is_empty() {
        default
    } else {
        val
    }
}

/// Helper to format large numbers to human-readable strings (e.g., 1500 -> 1.5k)
fn format_compact(num: u64) -> String {
    match NumberPrefix::decimal(num as f64) {
        NumberPrefix::Standalone(n) => n.to_string(),
        NumberPrefix::Prefixed(prefix, n) => {
            let formatted = format!("{:.1}", n);
            // Drops the .0 if it's a clean number (e.g., 1.0k becomes 1k)
            let trimmed = formatted.strip_suffix(".0").unwrap_or(&formatted);
            format!("{}{}", trimmed, prefix.symbol())
        }
    }
}

/// View your level card as a generated image.
#[poise::command(slash_command, guild_only, rename = "card")]
pub async fn card(
    ctx: poise::Context<'_, Data, Error>,
    #[description = "The user whose level card you want to view"] user: Option<User>,
) -> Result<(), Error> {
    let guild_id = ctx.guild_id().ok_or("This command can only be used inside a server.")?;
    let target_user = user.as_ref().unwrap_or(ctx.author());
    let svg_template = include_str!("assets/level_template.svg");

    let redis = &ctx.data().redis;
    let db = &ctx.data().db;
    let guild_configs_cache = &ctx.data().guild_configs;

    let settings = get_settings(db, redis, guild_configs_cache, guild_id.get() as i64).await?;

    if !is_leveling_enabled(&settings) {
        send_ephemeral(&ctx, "Leveling isn't enabled!").await?;
        return Ok(());
    }

    let stats_key = keys::member_stats_key(&guild_id, target_user.id);

    let user_level = get_user_level(
        redis,
        db,
        &guild_id,
        &target_user.id,
        &stats_key,
        &target_user.name,
    ).await?;

    let xp_needed = calculate_xp_needed(user_level.current_level);

    let rank = database::get_user_rank(
        db,
        guild_id.get() as i64,
        target_user.id.get() as i64,
        user_level.current_level,
        user_level.current_xp
    ).await?.map(|r| r as u64).unwrap_or(0);

    let level: u64 = user_level.current_level as u64;
    let xp: u64 = user_level.current_xp as u64;
    let max_xp: u64 = xp_needed as u64;

    let max_bar_width = 200.0;
    let fill_width = if max_xp > 0 {
        ((xp as f64 / max_xp as f64) * max_bar_width).clamp(7.0, 200.0) // 7.0 is the radius
    } else {
        7.0
    };

    let Some(card) = &settings.leveling.map(|l| l.image_card) else {
        send_ephemeral(&ctx, "Image card settings not found!").await?;
        return Ok(());
    };

    let bg_color = fallback(&card.background_color, "#000000");
    let bar_fg = fallback(&card.bar_foreground_color, "#5865F2");
    let bar_bg = fallback(&card.bar_background_color, "#dedede");
    let line_sep = fallback(&card.line_separator_color, "#5865F2");
    let username_color = fallback(&card.username_color, "#5865F2");
    let stats_color = fallback(&card.statistics_color, "#5865F2");
    let accent_color = fallback(&card.accent_color, "#5865F2");

    let avatar_url = target_user.face();

    let profile_picture = match reqwest::get(&avatar_url).await {
        Ok(resp) if resp.status().is_success() => {
            if let Ok(bytes) = resp.bytes().await {
                match image::load_from_memory(&bytes) {
                    Ok(img) => {
                        let mut png_bytes = Vec::new();
                        if img.write_to(&mut Cursor::new(&mut png_bytes), ImageFormat::Png).is_ok() {
                            let b64 = STANDARD.encode(&png_bytes);
                            format!("data:image/png;base64,{b64}")
                        } else {
                            avatar_url
                        }
                    }
                    Err(e) => {
                        tracing::warn!("Failed to decode avatar from memory: {e}");
                        avatar_url
                    }
                }
            } else {
                avatar_url
            }
        }
        _ => avatar_url,
    };

    let display_name = target_user.global_name.as_deref().unwrap_or(&target_user.name);

    // 👇 FORMATTING APPLIED HERE FOR SVG CARD
    let formatted_xp = format_compact(xp);
    let formatted_max_xp = format_compact(max_xp);

    let manipulated_svg = svg_template
        .replace("fill=\"#000000\"", &format!("fill=\"{}\"", bg_color))
        .replace("{{BACKGROUND_COLOR}}", bg_color)
        .replace("{{USERNAME}}", display_name)
        .replace("{{BAR.FOREGROUND}}", bar_fg)
        .replace("{{BAR.BACKGROUND}}", bar_bg)
        .replace("{{SEPARATOR}}", line_sep)
        .replace("{{PROFILE_PICTURE}}", &profile_picture)
        .replace("{{USERNAME_COLOR}}", username_color)
        .replace("{{STATISTICS}}", stats_color)
        .replace("{{ACCENT}}", accent_color)
        .replace("{{LEVEL}}", &level.to_string())
        .replace("{{XP.PROGRESS}}", &formatted_xp) // Used variable here
        .replace("{{XP.MAX}}", &formatted_max_xp)  // Used variable here
        .replace("{{RANK}}", &rank.to_string())
        .replace("{{FILL_WIDTH}}", &format!("{:.1}", fill_width));

    let png_bytes = rasterize_svg(&manipulated_svg, 2.0)?;

    let attachment = CreateAttachment::bytes(png_bytes, "level_card.png");
    ctx.send(poise::CreateReply::default().attachment(attachment)).await?;

    Ok(())
}

/// Add levels to a user (admin only).
#[poise::command(slash_command, guild_only, required_permissions = "MANAGE_GUILD", rename = "add")]
pub async fn add(
    ctx: poise::Context<'_, Data, Error>,
    #[description = "The user to add levels to"] user: User,
    #[description = "Number of levels to add"] amount: i32,
) -> Result<(), Error> {
    let guild_id = ctx.guild_id().ok_or("This command can only be used inside a server.")?;

    if amount <= 0 {
        send_ephemeral(&ctx, "Amount must be greater than 0.").await?;
        return Ok(());
    }

    let redis = &ctx.data().redis;
    let db = &ctx.data().db;
    let guild_configs_cache = &ctx.data().guild_configs;

    let settings = get_settings(db, redis, guild_configs_cache, guild_id.get() as i64).await?;
    if !is_leveling_enabled(&settings) {
        send_ephemeral(&ctx, "Leveling isn't enabled!").await?;
        return Ok(());
    }

    let stats_key = keys::member_stats_key(&guild_id, user.id);
    let mut user_level = get_user_level(redis, db, &guild_id, &user.id, &stats_key, &user.name).await?;

    let old_level = user_level.current_level;

    let safe_amount = amount.min(1000);
    user_level.current_level = user_level.current_level.saturating_add(safe_amount);

    if let Some(leveling_config) = &settings.leveling {
        if leveling_config.level_cap > 0 && user_level.current_level >= leveling_config.level_cap as i32 {
            user_level.current_level = leveling_config.level_cap as i32;
            user_level.current_xp = 0; // Only reset XP if they hit max level!
        }
    }

    user_level.cumulative_xp = calculate_cumulative_xp(user_level.current_level, user_level.current_xp);

    update_level(db, &user_level).await?;
    let serialized = serde_json::to_string(&user_level)?;
    let _: () = cache::save_user_level_cache(redis, &stats_key, serialized).await?;

    let embed = CreateEmbed::new()
        .title("Level Added")
        .description(format!(
            "Added **{}** level(s) to **{}**.\n\nOld level: **{}**\nNew level: **{}**",
            safe_amount, user.name, old_level, user_level.current_level
        ))
        .color(0x5865F2);

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
    ctx: poise::Context<'_, Data, Error>,
    #[description = "The user to remove levels from"] user: User,
    #[description = "Number of levels to remove"] amount: i32,
) -> Result<(), Error> {
    let guild_id = ctx.guild_id().ok_or("This command can only be used inside a server.")?;

    if amount <= 0 {
        send_ephemeral(&ctx, "Amount must be greater than 0.").await?;
        return Ok(());
    }

    let redis = &ctx.data().redis;
    let db = &ctx.data().db;
    let guild_configs_cache = &ctx.data().guild_configs;

    let settings = get_settings(db, redis, guild_configs_cache, guild_id.get() as i64).await?;
    if !is_leveling_enabled(&settings) {
        send_ephemeral(&ctx, "Leveling isn't enabled!").await?;
        return Ok(());
    }

    let stats_key = keys::member_stats_key(&guild_id, user.id);
    let mut user_level = get_user_level(redis, db, &guild_id, &user.id, &stats_key, &user.name).await?;

    let old_level = user_level.current_level;

    // Safe subtraction to prevent underflow panic!
    user_level.current_level = user_level.current_level.saturating_sub(amount).max(0);

    // Recalculate total XP while preserving current_xp progress within the level
    user_level.cumulative_xp = calculate_cumulative_xp(user_level.current_level, user_level.current_xp);

    update_level(db, &user_level).await?;
    let serialized = serde_json::to_string(&user_level)?;
    let _: () = cache::save_user_level_cache(redis, &stats_key, serialized).await?;

    let embed = CreateEmbed::new()
        .title("Level Removed")
        .description(format!(
            "Removed **{}** level(s) from **{}**.\n\nOld level: **{}**\nNew level: **{}**",
            amount, user.name, old_level, user_level.current_level
        ))
        .color(0x5865F2);

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
fn rasterize_svg(svg_str: &str, scale: f32) -> Result<Vec<u8>, Error> {
    let tree = Tree::from_str(svg_str, get_options())
        .map_err(|e| format!("Failed to parse SVG template: {e}"))?;

    let size = tree.size().to_int_size();

    // Calculate new scaled width and height
    let width = (size.width() as f32 * scale).round() as u32;
    let height = (size.height() as f32 * scale).round() as u32;

    let mut pixmap = Pixmap::new(width, height)
        .ok_or("Failed to allocate memory for PNG image")?;

    // Render with scale matrix
    resvg::render(&tree, Transform::from_scale(scale, scale), &mut pixmap.as_mut());

    let png_bytes = pixmap.encode_png()
        .map_err(|e| format!("Failed to encode PNG: {e}"))?;

    Ok(png_bytes)
}

fn is_leveling_enabled(settings: &GuildSettings) -> bool {
    settings.leveling.as_ref().map(|l| l.text.enabled || l.voice.enabled).unwrap_or(false)
}