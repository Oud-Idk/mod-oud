use crate::core::config::{get_guild_ctx, get_settings};
use crate::events::handlers::levels::levels_text::{calculation, UserLevel};
use crate::events::handlers::levels::utils::apply_level_rewards;
use crate::events::handlers::levels::{database, effects, rules};
use crate::types::config::config::Format;
use crate::types::config::leveling::{LevelingConfig, NotificationScope};
use crate::types::embed::DiscordEmbed;
use crate::types::{Data, Error};
use crate::utils::custom_msg::build_custom_message;
use crate::utils::placeholders::replace_level_notify_placeholder;
use redis::AsyncCommands;
use serenity::all::{ChannelId, Context, CreateMessage, GuildId, User, UserId};

pub async fn award_vc_xp_for_session(
    ctx: &Context,
    guild_id: GuildId,
    user_id: UserId,
    channel_id: ChannelId,
    join_time: i64,
    leave_time: i64,
    data: &Data,
) -> Result<(), Error> {
    let db = &data.db;
    let elapsed_seconds = leave_time - join_time;
    if elapsed_seconds < 60 {
        return Ok(());
    }

    let config = get_settings(db, &data.redis, guild_id.get() as i64).await?;
    let Some(leveling_config) = config.leveling else {
        return Ok(());
    };
    if !leveling_config.voice.enabled {
        return Ok(());
    }

    let mut redis = data.redis.clone();
    let user = user_id.to_user(&ctx.http).await?;

    // Check exclusions
    if rules::should_exclude_from_level_up(
        &leveling_config,
        &user,
        &mut redis,
        &(channel_id.get() as i64),
        &guild_id.get(),
        ctx,
    )
        .await
    {
        return Ok(());
    }

    let member = guild_id.member(&ctx.http, user_id).await?;
    let stats_key = format!("member:{}:{}", guild_id, user_id);
    let multiplier_key = format!("multipliers:{}", guild_id.get());

    let multiplier = rules::get_voice_multiplier(
        &mut redis,
        &multiplier_key,
        &data.db,
        &guild_id,
        channel_id,
        &member.roles,
    )
        .await?;

    // Calculate total accumulated XP
    let elapsed_minutes = elapsed_seconds / 60;
    let total_added_xp = calculate_session_xp(elapsed_minutes, &leveling_config, multiplier);

    let mut user_level = database::get_user_level(&mut redis, db, &guild_id, &user_id, &stats_key).await?;

    let should_be_clamped = database::clamp_to_level_cap(&leveling_config, &mut redis, db, &stats_key, &mut user_level).await?;
    if should_be_clamped { return Ok(()) }

    let previous_level = user_level.current_level;
    user_level.current_xp += total_added_xp;

    // Pass the level_cap configuration to the loop handler
    let leveled_up = effects::process_level_ups(&mut user_level, leveling_config.level_cap as i32);

    // Double-check clamp ensuring no rogue XP remains
    if leveling_config.level_cap > 0 && user_level.current_level >= leveling_config.level_cap as i32 {
        user_level.current_level = leveling_config.level_cap as i32;
        user_level.current_xp = 0;
    }

    // Keep cumulative XP properly synced
    user_level.cumulative_xp = calculation::calculate_cumulative_xp(user_level.current_level, user_level.current_xp);

    if leveled_up {
        handle_level_up(
            ctx,
            data,
            &user,
            &user_level,
            &leveling_config,
            &guild_id,
            channel_id,
            previous_level,
        )
            .await?;
    }

    database::update_level(db, &user_level).await?;

    let serialized = serde_json::to_string(&user_level)?;
    let _: () = redis.set_ex(&stats_key, serialized, 3600).await?;

    Ok(())
}

/// Sums random XP variations for each active minute.
fn calculate_session_xp(elapsed_minutes: i64, config: &LevelingConfig, multiplier: f32) -> i32 {
    let mut total_added_xp = 0;
    for _ in 0..elapsed_minutes {
        let base_xp = rand::random_range(config.voice.xp_range.min..=config.voice.xp_range.max);
        total_added_xp += (base_xp as f32 * multiplier) as i32;
    }
    total_added_xp
}

/// Dispatches level notifications and runs rewards functions.
async fn handle_level_up(
    ctx: &Context,
    data: &Data,
    user: &User,
    user_level: &UserLevel,
    config: &LevelingConfig,
    guild_id: &GuildId,
    channel_id: ChannelId,
    previous_level: i32,
) -> Result<(), Error> {
    if !matches!(config.notify.scope, NotificationScope::None) {
        send_voice_level_up_message(
            ctx,
            config.notify.embed.as_ref(),
            user,
            user_level,
            config,
            guild_id,
            channel_id,
            previous_level,
        )
            .await?;
    }

    let _ = apply_level_rewards(
        ctx,
        &data.db,
        guild_id,
        user.id,
        user_level.current_level,
    )
        .await;

    Ok(())
}

async fn send_voice_level_up_message(
    ctx: &Context,
    embed: Option<&DiscordEmbed>,
    user: &User,
    user_level: &UserLevel,
    config: &LevelingConfig,
    guild_id: &GuildId,
    voice_channel_id: ChannelId,
    previous_level: i32,
) -> Result<(), Error> {
    let is_embed = matches!(config.notify.format, Format::Embed);
    let gctx = get_guild_ctx(*guild_id, ctx.http.as_ref()).await?;

    let custom_message_opt = build_custom_message(
        is_embed,
        Some(&config.notify.content),
        embed,
        |text| {
            replace_level_notify_placeholder(
                text,
                &gctx,
                user,
                user_level.current_level,
                previous_level,
            )
        },
    )
        .unwrap_or_else(|e| {
            eprintln!("Failed to build custom VC level message: {}", e);
            None
        });

    let msg = custom_message_opt.unwrap_or_else(|| {
        let content = format!(
            "Congratulations, <@{}>. You have leveled up to **level {}**",
            user.id, user_level.current_level
        );
        CreateMessage::new().content(content)
    });

    effects::send_according_to_config(ctx, voice_channel_id, config, user, msg).await?;

    Ok(())
}