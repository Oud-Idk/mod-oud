use crate::commands::moderation::utils::send_ephemeral;
use crate::types::{Context, Error, GuildMetadata};
use crate::utils::logger::ActionType;
use crate::utils::moderation::actions::issue_warning_status_change;
use tracing::{debug, info, trace};

/// Helper function to handle both pardoning and unpardoning warnings.
pub async fn set_warning_active_status(
    ctx: Context<'_>,
    id: i64,
    set_active: bool,
) -> Result<(), Error> {
    trace!(
        warning_id = id,
        set_active,
        "Initiating warning active status adjustment"
    );

    let meta = GuildMetadata::extract(&ctx)?;

    let result = issue_warning_status_change(
        &ctx.data().db,
        &ctx.data().redis,
        &ctx.data().guild_configs,
        &ctx.serenity_context().http,
        meta.id,
        id,
        set_active,
        ctx.author(),
    ).await?;

    let (action_past_tense, action_type) = if set_active {
        ("unpardoned", ActionType::Unpardon)
    } else {
        ("pardoned", ActionType::Pardon)
    };

    match result {
        Some((target_user_id, reason)) => {
            send_ephemeral(
                &ctx,
                format!("Successfully {} warning **#{}** for <@{}>.", action_past_tense, id, target_user_id),
            ).await?;

            info!(
                warning_id = id,
                target_user_id,
                set_active,
                action = action_past_tense,
                "Warning active status successfully modified in the database"
            );
        }
        None => {
            let status_description = if set_active { "inactive" } else { "active" };
            debug!(
                warning_id = id,
                set_active,
                "Failed to change warning status: warning not found or already in target state"
            );

            send_ephemeral(
                &ctx,
                format!("Could not find an {} warning with ID **#{}** in this server.", status_description, id),
            ).await?;
        }
    }

    Ok(())
}