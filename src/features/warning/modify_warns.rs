use crate::core::config::state::{Context, Error};
use crate::features::warning::issuing::issue_warning_status_change;
use crate::shared::command_context::GuildMetadata;
use crate::shared::messages::send_ephemeral;
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
        &ctx.data().core.db,
        &ctx.data().core.redis,
        &ctx.data().core.guild_configs_cache,
        &ctx.serenity_context().http,
        meta.id,
        id,
        set_active,
        ctx.author(),
    ).await?;

    let action_past_tense  = if set_active {
        "unpardoned" 
    } else {
        "pardoned" 
    };

    match result {
        Some((target_user_id, _reason)) => {
            send_ephemeral(
                &ctx,
                format!("Successfully {action_past_tense} warning **#{id}** for <@{target_user_id}>."),
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
                format!("Could not find an {status_description} warning with ID **#{id}** in this server."),
            ).await?;
        }
    }

    Ok(())
}