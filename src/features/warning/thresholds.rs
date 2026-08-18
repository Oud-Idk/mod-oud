use crate::core::config::state::Error;
use crate::features::automod::{AutomodEntryRow, insert_automod_row};
use crate::features::warning::types::{WarnAction, WarnThreshold};
use serenity::all::{Http, Member, RoleId, Timestamp};
use sqlx::PgPool;
use std::sync::Arc;
use tracing::debug;
use tracing::field::debug;

pub async fn apply_threshold_actions(
    http: &Arc<Http>,
    db: &PgPool,
    member: &mut Member,
    thresholds: &[&WarnThreshold],
) -> Result<(), Error> {
    let mut actions = Vec::new();
    let mut warn_count = 0;

    for threshold in thresholds {
        warn_count = threshold.warn_count;
        for action in &threshold.action_type {
            match action {
                WarnAction::Ban => {
                    debug!("Executing auto-ban");
                    member
                        .ban_with_reason(http, 7, "Reached warning threshold")
                        .await?;
                    actions.push("BAN");
                }
                WarnAction::Kick => {
                    debug!("Executing auto-kick");
                    member
                        .kick_with_reason(http, "Reached warning threshold")
                        .await?;
                    actions.push("KICK");
                }
                WarnAction::Timeout => {
                    if let Some(secs) = threshold.duration {
                        debug!(secs, "Executing auto-timeout");
                        let until = Timestamp::from_unix_timestamp(
                            chrono::Utc::now().timestamp() + i64::from(secs),
                        )?;

                        let mut builder = serenity::builder::EditMember::new();
                        builder = builder.disable_communication_until(until.to_string());
                        member.edit(http, builder).await?;
                    }
                    actions.push("MUTE");
                }
                WarnAction::RoleAdd => {
                    if let Some(ref roles) = threshold.roles_to_add {
                        for role_id in roles {
                            debug!(role_id, "Adding role from threshold");
                            member
                                .add_role(http, RoleId::new((*role_id).cast_unsigned()))
                                .await?;
                        }
                    }
                    actions.push("ROLE_ADD");
                }
                WarnAction::RoleRemove => {
                    if let Some(ref roles) = threshold.roles_to_remove {
                        for role_id in roles {
                            debug!(role_id, "Removing role from threshold");
                            member
                                .remove_role(http, RoleId::new(*role_id as u64))
                                .await?;
                        }
                    }
                    actions.push("ROLE_REMOVE");
                }
                WarnAction::RoleRemoveAll => {
                    debug!("Removing all roles from member");
                    for role in &member.roles {
                        member.remove_role(http, *role).await?;
                    }
                    actions.push("ROLE_REMOVE_ALL");
                }
            }
        }
    }

    if warn_count > 0 {
        insert_threshold_automod_log(db, member, warn_count, &actions).await?;
    }
    Ok(())
}

async fn insert_threshold_automod_log(
    db: &PgPool,
    member: &mut Member,
    warn_count: i32,
    actions_taken: &[&str],
) -> Result<(), Error> {
    debug("Inserting automod-log for threshold");

    let entry = AutomodEntryRow {
        guild_id: member.guild_id,
        user_id: member.user.id,
        channel_id: None,
        message_id: None,
        rule_name: &format!("Warn Threshold: {}", warn_count),
        trigger_content: None,
        original_content: None,
        actions_taken,
    };

    insert_automod_row(db, entry).await?;
    Ok(())
}
