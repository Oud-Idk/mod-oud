//! Applying a moderation action to a report.
//!
//! Both front-ends call in here: the dashboard route and the reporting-channel buttons. They
//! differ only in how a moderator is identified and what they do with the outcome, so every
//! step with an effect on Discord or Postgres lives in this file exactly once.

use crate::core::config::settings::get_settings;
use crate::core::config::state::CoreServices;
use crate::features::moderation::{issue_ban, issue_mute};
use crate::features::reporting::database::{
    fetch_reporter_id, update_reported_message, update_reported_message_status_guarded,
};
use crate::features::reporting::types::{ReportStatus, ReportUpdate};
use crate::features::reporting::user_lookup::{resolve_moderator_id, resolve_user};
use crate::features::warning::issue_warning;
use crate::shared::embed::build_custom_message;
use serenity::all::{ChannelId, GuildId, Http, MessageId, Timestamp, User, UserId};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tracing::{debug, info, instrument, warn};

/// The handles every action needs, borrowed so a caller holding either state struct can build
/// one without naming the services individually.
pub struct ReportDeps<'a> {
    pub core: &'a CoreServices,
    pub http: &'a Arc<Http>,
}

/// Why an action could not be applied. The dashboard turns this into a status code and the
/// buttons into an ephemeral sentence, so it carries the sentence rather than only a category.
#[derive(Debug)]
pub enum ActionError {
    NotFound,
    InvalidInput(String),
    Discord(String),
    Internal,
}

impl std::fmt::Display for ActionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotFound => f.write_str("That report no longer exists."),
            Self::InvalidInput(m) | Self::Discord(m) => f.write_str(m),
            Self::Internal => f.write_str("Something went wrong on our end."),
        }
    }
}

impl std::error::Error for ActionError {}

impl From<sqlx::Error> for ActionError {
    fn from(_: sqlx::Error) -> Self {
        Self::Internal
    }
}

impl From<fred::error::Error> for ActionError {
    fn from(_: fred::error::Error) -> Self {
        Self::Internal
    }
}

impl From<std::time::SystemTimeError> for ActionError {
    fn from(_: std::time::SystemTimeError) -> Self {
        Self::Internal
    }
}

impl From<serenity::Error> for ActionError {
    fn from(e: serenity::Error) -> Self {
        Self::Discord(e.to_string())
    }
}

/// The `issue_*` helpers return `anyhow`, so a failure inside one is either already logged or a
/// fault of ours, never something the moderator can act on.
impl From<anyhow::Error> for ActionError {
    fn from(_: anyhow::Error) -> Self {
        Self::Internal
    }
}

impl From<serenity::model::timestamp::InvalidTimestamp> for ActionError {
    fn from(_: serenity::model::timestamp::InvalidTimestamp) -> Self {
        Self::Internal
    }
}

/// A moderator action to apply to one report.
pub struct ActionRequest<'a> {
    pub report_id: i64,
    pub guild_id: GuildId,
    /// Author of the reported message.
    pub target_id: UserId,
    /// The moderator taking the action. `None` means the caller could not name one, and the
    /// action is attributed to the bot.
    pub moderator_id: Option<UserId>,
    pub moderator_name: &'a str,
    /// Username of the reported author, used to render the warning DM.
    pub target_name: &'a str,
    pub reason: Option<&'a str>,
    pub duration_mins: Option<u64>,
}

/// Converts a minute count to seconds.
///
/// # Errors
/// Returns [`ActionError::InvalidInput`] if the multiply would wrap, which would put a timeout's
/// expiry in the past and lift the timeout the moment it was applied.
pub fn duration_secs(mins: u64) -> Result<u64, ActionError> {
    mins.checked_mul(60).ok_or_else(|| {
        debug!(mins, "report action duration out of range; rejecting it");
        ActionError::InvalidInput("That duration is too long.".to_string())
    })
}

/// Resolves the acting moderator, falling back to the bot when the caller named nobody.
async fn acting_moderator(
    deps: &ReportDeps<'_>,
    req: &ActionRequest<'_>,
) -> Result<User, ActionError> {
    let id = resolve_moderator_id(deps.http, req.moderator_id).await?;
    resolve_user(deps.http, id).await
}

/// Deletes the reported message.
///
/// # Errors
/// Returns [`ActionError::Discord`] when Discord refuses the delete. A message that is already
/// gone is not a failure, since the post was the goal either way.
#[instrument(skip_all, fields(report_id = req.report_id, %req.guild_id, %channel_id, %message_id))]
pub async fn delete_message(
    deps: &ReportDeps<'_>,
    req: &ActionRequest<'_>,
    channel_id: ChannelId,
    message_id: MessageId,
    audit_reason: &str,
) -> Result<(), ActionError> {
    match deps
        .http
        .delete_message(channel_id, message_id, Some(audit_reason))
        .await
    {
        Ok(()) => info!(%channel_id, %message_id, "reported message deleted"),
        Err(serenity::Error::Http(http_err))
            if http_err.status_code().map(|s| s.as_u16()) == Some(404) =>
        {
            warn!(%channel_id, %message_id, "reported message already gone per the discord api");
        }
        Err(e) => {
            warn!(error = %e, %channel_id, %message_id, "reported message delete failed");
            return Err(ActionError::Discord(
                "The message could not be deleted.".to_string(),
            ));
        }
    }

    update_reported_message(&deps.core.db, req.report_id, ReportUpdate::MessageDeleted).await?;
    Ok(())
}

/// Warns the author of the reported message.
///
/// # Errors
/// Returns [`ActionError`] when the warning could not be issued or recorded.
#[instrument(skip_all, fields(report_id = req.report_id, %req.guild_id, target_id = %req.target_id))]
pub async fn warn_user(deps: &ReportDeps<'_>, req: &ActionRequest<'_>) -> Result<(), ActionError> {
    let moderator = acting_moderator(deps, req).await?;

    issue_warning(
        &deps.core.db,
        &deps.core.redis,
        &deps.core.guild_configs_cache,
        &deps.core.username_tx,
        deps.http,
        req.guild_id,
        req.target_id,
        moderator.id,
        req.reason.unwrap_or("No reason specified"),
        req.moderator_name,
        req.target_name,
    )
    .await
    .inspect_err(|e| warn!(error = %e, "reported user warning not issued"))?;

    info!(
        report_id = req.report_id,
        %req.guild_id,
        target_id = %req.target_id,
        moderator_id = %moderator.id,
        "reported user warned"
    );

    update_reported_message(&deps.core.db, req.report_id, ReportUpdate::UserWarned).await?;
    Ok(())
}

/// Times the author of the reported message out.
///
/// # Errors
/// Returns [`ActionError::InvalidInput`] when no usable duration was given, and
/// [`ActionError`] when the timeout could not be issued or recorded.
#[instrument(skip_all, fields(report_id = req.report_id, %req.guild_id, target_id = %req.target_id, duration_mins = ?req.duration_mins))]
pub async fn timeout_user(
    deps: &ReportDeps<'_>,
    req: &ActionRequest<'_>,
) -> Result<(), ActionError> {
    let duration_mins = req.duration_mins.ok_or_else(|| {
        debug!(
            report_id = req.report_id,
            "timeout action reached without a duration"
        );
        ActionError::InvalidInput("That timeout needs a duration.".to_string())
    })?;

    let secs = duration_secs(duration_mins)?;
    let expires_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)?
        .as_secs()
        .checked_add(secs)
        .ok_or_else(|| {
            debug!(
                duration_mins,
                "timeout window expiry calculation overflowed"
            );
            ActionError::InvalidInput("That duration is too long.".to_string())
        })?;

    let timestamp = Timestamp::from_unix_timestamp(i64::try_from(expires_at).unwrap_or(i64::MAX))
        .inspect_err(|e| warn!(error = %e, "timeout timestamp unavailable"))?;

    let (moderator, target) = tokio::try_join!(
        acting_moderator(deps, req),
        resolve_user(deps.http, req.target_id)
    )?;
    let moderator_id = moderator.id;

    issue_mute(
        &deps.core.db,
        &deps.core.redis,
        &deps.core.guild_configs_cache,
        deps.http,
        req.guild_id,
        target,
        moderator,
        req.reason
            .unwrap_or("Timeout applied to a reported message"),
        &Duration::from_secs(secs),
        timestamp,
    )
    .await
    .inspect_err(|e| warn!(error = %e, "reported user timeout not issued"))?;

    info!(
        report_id = req.report_id,
        %req.guild_id,
        target_id = %req.target_id,
        %moderator_id,
        duration_mins,
        "reported user timed out"
    );

    update_reported_message(&deps.core.db, req.report_id, ReportUpdate::UserTimedOut).await?;
    Ok(())
}

/// Bans the author of the reported message.
///
/// # Errors
/// Returns [`ActionError`] when the ban could not be issued or recorded.
#[instrument(skip_all, fields(report_id = req.report_id, %req.guild_id, target_id = %req.target_id))]
pub async fn ban_user(deps: &ReportDeps<'_>, req: &ActionRequest<'_>) -> Result<(), ActionError> {
    let (moderator, target) = tokio::try_join!(
        acting_moderator(deps, req),
        resolve_user(deps.http, req.target_id)
    )?;
    let moderator_id = moderator.id;

    let duration = req
        .duration_mins
        .map(duration_secs)
        .transpose()?
        .map(Duration::from_secs);

    issue_ban(
        &deps.core.db,
        &deps.core.redis,
        &deps.core.guild_configs_cache,
        deps.http,
        req.guild_id,
        target,
        moderator,
        req.reason.unwrap_or("No reason specified"),
        7,
        duration,
    )
    .await
    .inspect_err(|e| warn!(error = %e, "reported user ban not applied"))?;

    info!(
        report_id = req.report_id,
        %req.guild_id,
        target_id = %req.target_id,
        %moderator_id,
        "reported user banned"
    );

    update_reported_message(&deps.core.db, req.report_id, ReportUpdate::UserBanned).await?;
    Ok(())
}

/// Settles the report's status and DMs the reporter.
///
/// The write is guarded on the report still being under review, so a second moderator settling
/// the same report is refused rather than double-DMing the reporter.
///
/// # Errors
/// Returns [`ActionError`] when the status could not be settled or the reporter is unreachable.
/// A DM the reporter cannot receive is logged and swallowed.
#[instrument(skip_all, fields(report_id = req.report_id, %req.guild_id, status = ?status))]
pub async fn settle(
    deps: &ReportDeps<'_>,
    req: &ActionRequest<'_>,
    status: ReportStatus,
) -> Result<(), ActionError> {
    let settings = get_settings(
        &deps.core.db,
        &deps.core.redis,
        &deps.core.guild_configs_cache,
        req.guild_id,
    )
    .await
    .inspect_err(|e| warn!(error = %e, "guild settings unavailable for a report resolution"))
    .map_err(|_| ActionError::Internal)?;

    let Some(report_config) = settings.report else {
        warn!(
            report_id = req.report_id,
            "report config missing for the target guild"
        );
        return Err(ActionError::InvalidInput(
            "Reporting is not configured in this server.".to_string(),
        ));
    };

    let settled = update_reported_message_status_guarded(&deps.core.db, req.report_id, status)
        .await
        .inspect_err(
            |e| warn!(error = %e, report_id = req.report_id, "report status update failed"),
        )?;

    if !settled {
        debug!(
            report_id = req.report_id,
            reason = "not_under_review",
            "report status change refused; it was already settled"
        );
        return Err(ActionError::InvalidInput(
            "This report has already been resolved.".to_string(),
        ));
    }

    let reporter_id = fetch_reporter_id(&deps.core.db, req.report_id)
        .await
        .inspect_err(
            |e| warn!(error = %e, report_id = req.report_id, "reporter id lookup failed"),
        )?;

    info!(
        report_id = req.report_id,
        %req.guild_id,
        %reporter_id,
        status = ?status,
        "report status changed"
    );

    let layout = match status {
        ReportStatus::Actioned => report_config.resolved_dm,
        ReportStatus::Dismissed => report_config.dismissed_dm,
        ReportStatus::UnderReview => None,
    };

    let Some(layout) = layout.filter(|l| l.enabled) else {
        debug!(
            report_id = req.report_id,
            "resolution dm skipped, the configuration is disabled"
        );
        return Ok(());
    };

    let fallback = || {
        format!(
            "Hello! Your report (ID: {}) has been resolved. Status: **{}**",
            req.report_id,
            status.label()
        )
    };

    let dm_channel = match reporter_id.create_dm_channel(deps.http).await {
        Ok(channel) => channel,
        Err(e) => {
            warn!(error = %e, %reporter_id, "reporter dm channel unavailable");
            return Ok(());
        }
    };

    let built = build_custom_message(
        layout.message.format,
        &layout.message.content,
        &layout.message.embed,
        |s: &str| s.to_string(),
    );

    let sent = match built {
        Ok(Some(builder)) => dm_channel.send_message(deps.http, builder).await,
        Ok(None) => dm_channel.say(deps.http, fallback()).await,
        Err(e) => {
            warn!(error = %e, report_id = req.report_id, "resolution dm layout compilation failed");
            dm_channel.say(deps.http, fallback()).await
        }
    };

    if let Err(e) = sent {
        warn!(error = %e, %reporter_id, "resolution dm to reporter not sent");
    } else {
        info!(%reporter_id, "resolution dm sent to reporter");
    }

    Ok(())
}
