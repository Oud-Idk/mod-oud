use crate::core::config::state::BotData;
use crate::features::dynamic_slowmode::audit;
use crate::features::dynamic_slowmode::database;
use crate::features::dynamic_slowmode::types::DisarmReason;
use serenity::all::audit_log::{Action, Change, ChannelAction};
use serenity::all::{AuditLogEntry, ChannelId, Context, GuildId};
use tracing::{debug, instrument};

/// Disarms a channel when someone other than the bot changes its slowmode.
///
/// The fast path; `jobs::write_slowmode` re-checks the live value before every write.
#[instrument(skip(ctx, data, entry), fields(%guild_id))]
pub async fn handle_audit_log_entry(
    ctx: &Context,
    guild_id: GuildId,
    entry: &AuditLogEntry,
    data: &BotData,
) {
    if !matches!(entry.action, Action::Channel(ChannelAction::Update)) {
        return;
    }

    if entry.user_id == ctx.cache.current_user().id {
        return;
    }

    let changed_rate_limit = entry.changes.as_ref().is_some_and(|changes| {
        changes
            .iter()
            .any(|change| matches!(change, Change::RateLimitPerUser { .. }))
    });

    if !changed_rate_limit {
        return;
    }

    let Some(target) = entry.target_id else {
        return;
    };
    let channel_id = ChannelId::new(target.get());

    if let Err(e) = disarm_if_armed(data, guild_id, channel_id).await {
        debug!(error = ?e, %channel_id, "slowmode disarm after human edit failed");
    }
}

/// Disarms the channel if the bot was driving it. Leaves untouched channels alone.
///
/// # Errors
/// Returns `Err` if the database update fails.
pub async fn disarm_if_armed(
    data: &BotData,
    guild_id: GuildId,
    channel_id: ChannelId,
) -> anyhow::Result<()> {
    let Some(state) = database::fetch_state(&data.core.db, channel_id).await? else {
        return Ok(());
    };

    if !state.is_armed() {
        return Ok(());
    }

    database::disarm(&data.core.db, channel_id, DisarmReason::HumanEdit.as_str()).await?;

    audit::disarmed(guild_id, channel_id, DisarmReason::HumanEdit.as_str());
    Ok(())
}
