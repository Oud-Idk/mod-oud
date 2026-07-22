use crate::commands::moderation::warn::database::{delete_warn, update_warn};
use crate::core::config::{get_guild_ctx, get_settings};
use crate::events::handlers::message_filter::database::insert_automod_log;
use crate::types::config::config::{Format, GuildSettings};
use crate::types::Error;
use crate::utils::custom_msg::build_custom_message;
use crate::utils::logger::{log_moderation_action, ActionType};
use crate::utils::moderation::database::{fetch_warn_thresholds, insert_warn, ModerationAction, WarnThreshold};
use crate::utils::moderation::{database, MODERATION_FOOTER};
use crate::utils::placeholders::{replace_ban_placeholders, replace_basic_placeholder, replace_kick_placeholder, replace_mute_placeholder, replace_reason_placeholders};
use crate::{fetch_mod_ctx, send_mod_dm};
use chrono::TimeDelta;
use duration_str::HumanFormat;
use fred::clients::Client;
use poise::serenity_prelude as serenity;
use serenity::all::{ChannelId, CreateEmbed, CreateEmbedFooter, CreateInvite, CreateMessage, GuildId, Http, Member, RoleId, Timestamp, User, UserId};
use sqlx::PgPool;
use std::sync::Arc;
use std::time::Duration;
use tracing::field::debug;
use tracing::{debug, error, info, instrument, warn};

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

pub async fn delete_entire_category(
    http: impl AsRef<Http>,
    guild_id: GuildId,
    category_id: ChannelId,
) -> Result<usize, serenity::Error> {
    let http_ref = http.as_ref();

    // Fetch all channels in the guild
    let channels = guild_id.channels(http_ref).await?;

    // Filter out the kiddos (channels belonging to this category)
    let child_channels: Vec<ChannelId> = channels
        .values()
        .filter(|channel| channel.parent_id == Some(category_id))
        .map(|channel| channel.id)
        .collect();

    info!(
        guild_id = %guild_id,
        category_id = %category_id,
        count = child_channels.len(),
        "Found child channels to delete"
    );

    let mut deleted_count = 0;
    for channel_id in &child_channels {
        // We try to delete each child. If one fails, we log it and keep going
        // so we don't leave the rest of the category stranded.
        match channel_id.delete(http_ref).await {
            Ok(_) => {
                debug!(channel_id = %channel_id, "Deleted channel");
                deleted_count += 1;
            }
            Err(e) => {
                warn!(
                    error = ?e,
                    channel_id = %channel_id,
                    "Failed to delete child channel inside category"
                );
            }
        }
    }

    // Now that the kids are out of the house, we can delete the category itself.
    category_id.delete(http_ref).await?;

    Ok(deleted_count)
}