use crate::events::handlers::message_filter::database::insert_automod_log;
use crate::types::Error;
use crate::utils::moderation::database::{ModerationAction, WarnThreshold};
use serenity::all::{Http, Member, RoleId, Timestamp};
use sqlx::PgPool;
use std::sync::Arc;
use tracing::debug;
use tracing::field::debug;

pub(crate) async fn apply_threshold_actions(
    http: &Arc<Http>,
    db: &PgPool,
    member: &mut Member,
    thresholds: &[&WarnThreshold],
) -> Result<(), Error> {
    for threshold in thresholds {
        for action in &threshold.action_type {
            match action {
                ModerationAction::Ban => {
                    debug!("Executing auto-ban");
                    member.ban_with_reason(http, 7, "Reached warning threshold").await?;
                    insert_threshold_automod_log(db, member, &threshold, "ban").await?;
                }
                ModerationAction::Kick => {
                    debug!("Executing auto-kick");
                    member.kick_with_reason(http, "Reached warning threshold").await?;
                    insert_threshold_automod_log(db, member, &threshold, "kick").await?;
                }
                ModerationAction::Timeout => {
                    if let Some(secs) = threshold.duration {
                        debug!(secs, "Executing auto-timeout");
                        let until = Timestamp::from_unix_timestamp(
                            chrono::Utc::now().timestamp() + secs as i64
                        )?;

                        let mut builder = serenity::builder::EditMember::new();
                        builder = builder.disable_communication_until(until.to_string());
                        member.edit(http, builder).await?;
                    }
                    insert_threshold_automod_log(db, member, &threshold, "mute").await?;
                }
                ModerationAction::RoleAdd => {
                    if let Some(ref roles) = threshold.roles_to_add {
                        for role_id in roles {
                            debug!(role_id, "Adding role from threshold");
                            member.add_role(http, RoleId::new(*role_id as u64)).await?;
                        }
                    }
                    insert_threshold_automod_log(db, member, &threshold, "role_add").await?;
                }
                ModerationAction::RoleRemove => {
                    if let Some(ref roles) = threshold.roles_to_remove {
                        for role_id in roles {
                            debug!(role_id, "Removing role from threshold");
                            member.remove_role(http, RoleId::new(*role_id as u64)).await?;
                        }
                    }
                    insert_threshold_automod_log(db, member, &threshold, "role_remove").await?;
                }
                ModerationAction::RoleRemoveAll => {
                    debug!("Removing all roles from member");
                    for role in &member.roles {
                        member.remove_role(http, *role).await?;
                    }
                    insert_threshold_automod_log(db, member, &threshold, "role_remove_all").await?;
                }
            }
        }
    }
    Ok(())
}

async fn insert_threshold_automod_log(db: &PgPool, member: &mut Member, threshold: &WarnThreshold, name: &str) -> Result<(), Error> {
    debug("Inserting automod-log for threshold");
    insert_automod_log(
        db,
        member.guild_id.get() as i64,
        member.user.id.get() as i64,
        None, None,
        &format!("Warn Threshold: {}", threshold.warn_count),
        None, None,
        &[name], &member.user.name,
    ).await?;
    Ok(())
}