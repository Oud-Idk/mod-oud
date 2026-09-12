use crate::core::config::state::{BotData, Error};
use crate::features::moderation::database::log_external_moderation_action;
use crate::features::moderation::types::ActionType;
use crate::shared::store_username_relation;
use chrono::TimeDelta;
use serenity::all::{
    Context, GuildId,
    audit_log::{Action, Change, MemberAction},
    AuditLogEntry,
};
use tracing::{debug, instrument, warn};

/// Syncs native Discord moderation actions (right-click timeout/kick/ban, etc.)
/// into `moderation_logs`.
///
/// Discord emits [`FullEvent::GuildAuditLogEntryCreate`](serenity::all::FullEvent)
/// for every audit log entry, so actions performed outside the bot's slash
/// commands arrive here with moderator, target, and reason already resolved.
/// Bot-issued actions are skipped (the bot's own `user_id`) because the
/// `issuing` path already logged them — without this guard every `/mute`
/// would double-insert.
///
/// Only `Kick`, `BanAdd`, `BanRemove`, and timeout `Update` entries are
/// stored. Everything else (role updates, prunes, automod outcomes, …) is
/// ignored. No DMs are sent and no unban is scheduled: this is log-only.
///
/// # Errors
/// Returns an error if the moderation log insert fails. Best-effort username
/// resolution never fails the call.
#[instrument(skip(ctx, entry, data), fields(%guild_id, action = ?entry.action))]
pub async fn handle_audit_log_entry(
    ctx: &Context,
    guild_id: GuildId,
    entry: &AuditLogEntry,
    data: &BotData,
) -> Result<(), Error> {
    let Some((action, duration)) = map_audit_action(entry) else {
        return Ok(());
    };

    if entry.user_id == ctx.cache.current_user().id {
        debug!("Skipping audit log entry created by the bot itself");
        return Ok(());
    }

    let Some(target_generic_id) = entry.target_id else {
        warn!("Audit log entry has no target; skipping moderation sync");
        return Ok(());
    };
    let target_id = target_generic_id.get().into();
    let moderator_id = entry.user_id;
    let reason = entry.reason.clone();

    log_external_moderation_action(
        &data.core.db,
        guild_id,
        target_id,
        moderator_id,
        reason.as_deref(),
        action,
        duration,
    )
    .await?;

    debug!(?action, "Synced native moderation action to database");

    // Best-effort username enrichment for the dashboard join. Never fails sync.
    let http = ctx.http.clone();
    let username_tx = data.core.username_tx.clone();
    tokio::spawn(async move {
        for user_id in [target_id, moderator_id] {
            match user_id.to_user(&http).await {
                Ok(user) => {
                    if let Err(e) =
                        store_username_relation(&username_tx, user_id, &user.name).await
                    {
                        warn!(error = %e, %user_id, "Failed to queue username for audit-synced log");
                    }
                }
                Err(e) => {
                    debug!(error = %e, %user_id, "Could not resolve user for audit-synced log");
                }
            }
        }
    });

    Ok(())
}

/// Maps a Discord audit log entry to a moderation action and optional duration.
///
/// Returns `None` for audit actions outside the mute/kick/ban family.
fn map_audit_action(entry: &AuditLogEntry) -> Option<(ActionType, Option<TimeDelta>)> {
    match entry.action {
        Action::Member(MemberAction::Kick) => Some((ActionType::Kick, None)),
        Action::Member(MemberAction::BanAdd) => Some((ActionType::Ban, None)),
        Action::Member(MemberAction::BanRemove) => Some((ActionType::Unban, None)),
        Action::Member(MemberAction::Update) => map_timeout_update(entry),
        _ => None,
    }
}

/// Maps a member-update entry to `Mute`/`Unmute` via its
/// `communication_disabled_until` change.
///
/// A future timestamp means the user was timed out (duration = until − now);
/// a missing or past timestamp means the timeout was removed.
fn map_timeout_update(entry: &AuditLogEntry) -> Option<(ActionType, Option<TimeDelta>)> {
    let changes = entry.changes.as_deref().unwrap_or_default();
    let timeout_change = changes.iter().find_map(|change| match change {
        Change::CommunicationDisabledUntil { new, .. } => Some(new),
        _ => None,
    })?;

    Some(timeout_change.map_or((ActionType::Unmute, None), |until| {
        let remaining = until.unix_timestamp() - chrono::Utc::now().timestamp();
        if remaining > 0 {
            (ActionType::Mute, TimeDelta::seconds(remaining).into())
        } else {
            (ActionType::Unmute, None)
        }
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Builds an audit log entry via deserialization (`AuditLogEntry` is
    /// `#[non_exhaustive]` and cannot be constructed with a struct literal).
    /// `action_num` follows Discord's audit log event IDs (20 = kick,
    /// 22 = ban add, 23 = ban remove, 24 = member update, …).
    fn make_entry(action_num: u8, changes: serde_json::Value) -> AuditLogEntry {
        serde_json::from_value(serde_json::json!({
            "target_id": "2",
            "action_type": action_num,
            "reason": null,
            "user_id": "1",
            "changes": changes,
            "id": "3",
        }))
        .expect("valid test audit log entry")
    }

    fn timeout_change(new_value: serde_json::Value) -> serde_json::Value {
        serde_json::json!({
            "key": "communication_disabled_until",
            "old_value": null,
            "new_value": new_value,
        })
    }

    #[test]
    fn ignores_non_moderation_actions() {
        // 10 = channel create, 30 = role create, 21 = prune, 25 = role update.
        for action_num in [10_u8, 30, 21, 25] {
            let entry = make_entry(action_num, serde_json::Value::Null);
            assert!(
                map_audit_action(&entry).is_none(),
                "action {action_num} should be ignored"
            );
        }
    }

    #[test]
    fn maps_kick_ban_unban() {
        for (action_num, expected) in [
            (20_u8, ActionType::Kick),
            (22, ActionType::Ban),
            (23, ActionType::Unban),
        ] {
            let entry = make_entry(action_num, serde_json::Value::Null);
            let (action, duration) = map_audit_action(&entry).expect("should map");
            assert_eq!(action, expected);
            assert!(duration.is_none());
        }
    }

    #[test]
    fn maps_future_timeout_to_mute() {
        let entry = make_entry(
            24,
            serde_json::json!([timeout_change(
                serde_json::json!("2030-01-01T00:00:00.000Z")
            )]),
        );
        let (action, duration) = map_audit_action(&entry).expect("should map");
        assert_eq!(action, ActionType::Mute);
        let duration = duration.expect("mute should carry a duration");
        assert!(duration.num_seconds() > 0);
    }

    #[test]
    fn maps_cleared_timeout_to_unmute() {
        let entry = make_entry(
            24,
            serde_json::json!([timeout_change(serde_json::Value::Null)]),
        );
        let (action, duration) = map_audit_action(&entry).expect("should map");
        assert_eq!(action, ActionType::Unmute);
        assert!(duration.is_none());
    }

    #[test]
    fn maps_expired_timeout_to_unmute() {
        let entry = make_entry(
            24,
            serde_json::json!([timeout_change(
                serde_json::json!("2000-01-01T00:00:00.000Z")
            )]),
        );
        let (action, _) = map_audit_action(&entry).expect("should map");
        assert_eq!(action, ActionType::Unmute);
    }

    #[test]
    fn ignores_member_update_without_timeout_change() {
        let entry = make_entry(24, serde_json::json!([]));
        assert!(map_audit_action(&entry).is_none());
    }
}
