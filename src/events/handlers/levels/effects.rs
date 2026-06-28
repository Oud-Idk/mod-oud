use crate::events::handlers::levels::calculation;
use crate::types::config::leveling::{LevelingConfig, NotificationScope};
use crate::types::leveling::UserLevel;
use crate::types::Error;
use serenity::all::{ChannelId, Context, CreateMessage, User};
use tracing::trace;

pub async fn send_according_to_config(
    ctx: &Context,
    channel_id: ChannelId,
    config: &LevelingConfig,
    author: &User,
    msg: CreateMessage,
) -> Result<(), Error> {
    trace!(
        channel_id = channel_id.get(),
        author_id = author.id.get(),
        "Sending announcement message according to notification scope configuration"
    );

    match config.notify.scope {
        NotificationScope::CurrentChannel => {
            channel_id.send_message(&ctx.http, msg).await?;
        },
        NotificationScope::SpecifiedChannel => {
            if let Some(channel_id) = config.notify.channel_id {
                ChannelId::from(channel_id).send_message(ctx.http.clone(), msg).await?;
            }
        },
        NotificationScope::Dm => {
            let _ = author.dm(&ctx.http, msg).await;
        }
        _ => {}
    }
    Ok(())
}

/// Applies cumulative XP changes and loops through any earned levels.
pub fn process_level_ups(user_level: &mut UserLevel, level_cap: i32) -> bool {
    let mut leveled_up = false;

    loop {
        if level_cap > 0 && user_level.current_level >= level_cap {
            user_level.current_xp = 0;
            break;
        }

        let xp_needed = calculation::calculate_xp_needed(user_level.current_level);
        if user_level.current_xp >= xp_needed {
            user_level.current_xp -= xp_needed;
            user_level.current_level += 1;
            leveled_up = true;
        } else {
            break;
        }
    }

    if level_cap > 0 && user_level.current_level >= level_cap {
        user_level.current_level = level_cap;
        user_level.current_xp = 0;
    }

    user_level.cumulative_xp =
        calculation::calculate_cumulative_xp(user_level.current_level, user_level.current_xp);

    leveled_up
}