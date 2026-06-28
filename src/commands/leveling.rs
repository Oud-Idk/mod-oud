use crate::events::handlers::levels::calculation::calculate_xp_needed;
use crate::events::handlers::levels::database::get_user_level;
use crate::types::{Data, Error};
use serenity::all::{CreateEmbed, User};
use tracing::{debug, trace};

/// Check your current level and experience progress, or inspect another user.
#[poise::command(slash_command, guild_only, rename = "level")]
pub async fn level(
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
        "Invoked level slash command"
    );

    let mut redis = ctx.data().redis.clone();
    let db = &ctx.data().db;

    let stats_key = format!("member:{}:{}", guild_id, target_id);

    trace!(
        target_id = target_id_u64,
        key = %stats_key,
        "Retrieving level profile from database/cache"
    );

    // Retrieve user level utilizing your existing utility
    let user_level = get_user_level(
        &mut redis,
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

    // Build a simple 10-segment text progress bar
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

    // Create the presentation embed
    let embed = CreateEmbed::new()
        .author(
            serenity::all::CreateEmbedAuthor::new(&target_user.name)
                .icon_url(target_user.face()),
        )
        .title("Level Profile".to_string())
        .field("Current Level", format!("🏆 **Level {}**", user_level.current_level), true)
        .field("Experience", format!("✨ **{}/{}** XP", user_level.current_xp, xp_needed), true)
        .field("Progress", format!("{}\n`{:.1}%`", progress_bar, progress_percentage * 100.0), false)
        .color(0x5865F2); // Blurple color

    trace!(target_id = target_id_u64, "Dispatching response embed back to channel");
    ctx.send(poise::CreateReply::default().embed(embed)).await?;

    Ok(())
}