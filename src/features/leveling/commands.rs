#![allow(missing_docs, clippy::unused_async)]
use crate::constants::BRAND_COLOR;
use crate::core::config::settings::{get_settings, GuildSettings};
use crate::core::config::state::{Context, Error};
use crate::features::leveling::calculation::{calculate_cumulative_xp, calculate_xp_needed};
use crate::features::leveling::database::{get_user_level, update_level};
use crate::features::leveling::{cache, database, keys};
use crate::shared::card_engine::{fetch_avatar_data_uri, render_svg_to_png, SvgTemplate};
use crate::shared::messages::send_ephemeral;
use anyhow::Context as _;
use anyhow::Result;
use serenity::all::{CreateAttachment, CreateEmbed, User};
use tracing::{debug};
use unit_prefix::NumberPrefix;

#[poise::command(
    slash_command,
    guild_only,
    subcommands("view", "card", "add", "remove"),
    rename = "level"
)]
pub async fn level(_: Context<'_>) -> Result<(), Error> {
    Ok(())
}

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

    let user_level = get_user_level(
        redis,
        db,
        guild_id,
        target_id,
        &stats_key,
        &target_user.name,
    )
        .await?;

    let xp_needed = calculate_xp_needed(user_level.current_level);

    let permille = user_level
        .current_xp
        .saturating_mul(1000)
        .checked_div(xp_needed)
        .unwrap_or(0)
        .clamp(0, 1000);

    let filled = usize::try_from((permille + 50) / 100).unwrap_or(0).min(10);
    let progress_bar = format!("{}{}", "🟩".repeat(filled), "⬛".repeat(10 - filled));
    let percent_text = format!("{}.{}%", permille / 10, permille % 10);

    let rank = database::get_user_rank(db, guild_id, target_id)
        .await?
        .map_or_else(|| "Not Available".to_string(), |r| r.to_string());

    let formatted_xp = format_compact(user_level.current_xp);
    let formatted_xp_needed = format_compact(xp_needed);

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
            format!("**{formatted_xp}/{formatted_xp_needed}** XP"),
            true,
        )
        .field(
            "Progress",
            format!("{progress_bar}\n`{percent_text}`"),
            false,
        )
        .field("Rank", format!("**Rank #{rank}**"), false)
        .color(BRAND_COLOR);

    ctx.send(poise::CreateReply::default().embed(embed)).await?;
    Ok(())
}

fn fallback<'a>(val: &'a str, default: &'a str) -> &'a str {
    if val.trim().is_empty() { default } else { val }
}

#[allow(clippy::cast_precision_loss)]
fn format_compact(num: u64) -> String {
    match NumberPrefix::decimal(num as f64) {
        NumberPrefix::Standalone(n) => n.to_string(),
        NumberPrefix::Prefixed(prefix, n) => {
            let formatted = format!("{n:.1}");
            let trimmed = formatted.strip_suffix(".0").unwrap_or(&formatted);
            format!("{}{}", trimmed, prefix.symbol())
        }
    }
}

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
    let rank = database::get_user_rank(db, guild_id, target_user.id).await?.unwrap_or(0);

    let level = user_level.current_level;
    let xp = user_level.current_xp;
    let max_xp = xp_needed;

    let fill_tenths = (xp.saturating_mul(2000) + max_xp / 2)
        .checked_div(max_xp)
        .map_or(70, |w| w.clamp(70, 2000));

    let fill_width_str = format!("{}.{}", fill_tenths / 10, fill_tenths % 10);

    let Some(card) = &settings.leveling.map(|l| l.image_card) else {
        send_ephemeral(&ctx, "Image card settings not found!").await?;
        return Ok(());
    };

    let bg_color = fallback(&card.background_color, "#000000");
    let bar_foreground = fallback(&card.bar_foreground_color, "#5865F2");
    let bar_background = fallback(&card.bar_background_color, "#dedede");
    let line_sep = fallback(&card.line_separator_color, "#5865F2");
    let username_color = fallback(&card.username_color, "#5865F2");
    let stats_color = fallback(&card.statistics_color, "#5865F2");
    let accent_color = fallback(&card.accent_color, "#5865F2");

    let avatar_url = target_user.face();
    let profile_picture = fetch_avatar_data_uri(&avatar_url)
        .await
        .unwrap_or_else(|| avatar_url.clone());

    let display_name = target_user
        .global_name
        .as_deref()
        .unwrap_or(&target_user.name);

    let formatted_xp = format_compact(xp);
    let formatted_max_xp = format_compact(max_xp);

    let svg = SvgTemplate::new(svg_template)
        .set_raw("BACKGROUND_COLOR", bg_color)
        .set_text("USERNAME", display_name)
        .set_raw("BAR.FOREGROUND", bar_foreground)
        .set_raw("BAR.BACKGROUND", bar_background)
        .set_raw("SEPARATOR", line_sep)
        .set_raw("PROFILE_PICTURE", &profile_picture)
        .set_raw("USERNAME_COLOR", username_color)
        .set_raw("STATISTICS", stats_color)
        .set_raw("ACCENT", accent_color)
        .set_raw("LEVEL", level)
        .set_raw("XP.PROGRESS", formatted_xp)
        .set_raw("XP.MAX", formatted_max_xp)
        .set_raw("RANK", rank)
        .set_raw("FILL_WIDTH", fill_width_str)
        .render();

    let png_bytes = render_svg_to_png(svg, 2.0).await?;
    let attachment = CreateAttachment::bytes(png_bytes, "level_card.png");
    ctx.send(poise::CreateReply::default().attachment(attachment))
        .await?;

    Ok(())
}

#[poise::command(
    slash_command,
    guild_only,
    required_permissions = "MANAGE_GUILD",
    rename = "add"
)]
pub async fn add(
    ctx: Context<'_>,
    #[description = "The user to add levels to"] user: User,
    #[description = "Number of levels to add"] amount: u32,
) -> Result<()> {
    let guild_id = ctx.guild_id().with_context(|| "Must be run in a guild")?;

    if amount == 0 {
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
        user_level.current_xp = 0;
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

#[poise::command(
    slash_command,
    guild_only,
    required_permissions = "MANAGE_GUILD",
    rename = "remove"
)]
pub async fn remove(
    ctx: Context<'_>,
    #[description = "The user to remove levels from"] user: User,
    #[description = "Number of levels to remove"] amount: u32,
) -> Result<()> {
    let guild_id = ctx.guild_id().with_context(|| "Must be run in a guild")?;

    if amount == 0 {
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
    user_level.current_level = user_level.current_level.saturating_sub(amount);

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

fn is_leveling_enabled(settings: &GuildSettings) -> bool {
    settings
        .leveling
        .as_ref()
        .is_some_and(|l| l.text.enabled || l.voice.enabled)
}