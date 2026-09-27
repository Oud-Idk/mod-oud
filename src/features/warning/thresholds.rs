use crate::core::config::state::Error;
use crate::features::automod::{AutomodEntryRow, insert_automod_row};
use crate::features::warning::audit;
use crate::features::warning::types::{WarnAction, WarnThreshold};
use serenity::all::{Http, Member, Timestamp};
use sqlx::PgPool;
use std::sync::Arc;
use tracing::debug;

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
                    member
                        .ban_with_reason(http, 7, "Reached warning threshold")
                        .await?;
                    audit::auto_ban_applied(
                        threshold.guild_id,
                        member.user.id,
                        threshold.warn_count,
                    );
                    actions.push("BAN");
                }
                WarnAction::Kick => {
                    member
                        .kick_with_reason(http, "Reached warning threshold")
                        .await?;
                    audit::auto_kick_applied(
                        threshold.guild_id,
                        member.user.id,
                        threshold.warn_count,
                    );
                    actions.push("KICK");
                }
                WarnAction::Timeout => {
                    if let Some(secs) = threshold.duration {
                        let until = Timestamp::from_unix_timestamp(
                            chrono::Utc::now().timestamp() + i64::from(secs),
                        )?;

                        let mut builder = serenity::builder::EditMember::new();
                        builder = builder.disable_communication_until(until.to_string());
                        member.edit(http, builder).await?;
                        audit::auto_timeout_applied(
                            threshold.guild_id,
                            member.user.id,
                            threshold.warn_count,
                            secs,
                        );
                    }
                    actions.push("MUTE");
                }
                WarnAction::RoleAdd => {
                    if let Some(ref roles) = threshold.roles_to_add {
                        for role_id in roles {
                            member.add_role(http, *role_id).await?;
                            audit::threshold_role_added(
                                threshold.guild_id,
                                member.user.id,
                                *role_id,
                                threshold.warn_count,
                            );
                        }
                    }
                    actions.push("ROLE_ADD");
                }
                WarnAction::RoleRemove => {
                    if let Some(ref roles) = threshold.roles_to_remove {
                        for role_id in roles {
                            member.remove_role(http, *role_id).await?;
                            audit::threshold_role_removed(
                                threshold.guild_id,
                                member.user.id,
                                *role_id,
                                threshold.warn_count,
                            );
                        }
                    }
                    actions.push("ROLE_REMOVE");
                }
                WarnAction::RoleRemoveAll => {
                    let removed = member.roles.len();
                    for role in &member.roles {
                        member.remove_role(http, *role).await?;
                    }
                    audit::all_roles_removed(
                        threshold.guild_id,
                        member.user.id,
                        threshold.warn_count,
                        removed,
                    );
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
    member: &Member,
    warn_count: i32,
    actions_taken: &[&str],
) -> Result<(), Error> {
    let entry = AutomodEntryRow {
        guild_id: member.guild_id,
        user_id: member.user.id,
        channel_id: None,
        message_id: None,
        rule_name: &format!("Warn Threshold: {warn_count}"),
        trigger_content: None,
        original_content: None,
        actions_taken,
    };

    insert_automod_row(db, entry).await?;
    debug!("warn threshold automod log stored");
    Ok(())
}
