use crate::features::reporting::moderation::ActionError;
use poise::serenity_prelude::{Http, User, UserId};
use tracing::{instrument, warn};

/// Resolves who a report action is attributed to. A caller that could not name a moderator
/// falls back to the bot, so a dashboard action is never recorded against nobody.
#[instrument(skip(http))]
pub async fn resolve_moderator_id(
    http: &Http,
    moderator_id: Option<UserId>,
) -> Result<UserId, ActionError> {
    match moderator_id {
        Some(id) => Ok(id),
        None => http
            .get_current_user()
            .await
            .map(|u| u.id)
            .inspect_err(|e| {
                warn!(error = %e, fallback = "bot id", "moderator id for a report action unavailable");
            })
            .map_err(|_| ActionError::Internal),
    }
}

#[instrument(skip(http))]
pub async fn resolve_user(http: &Http, user_id: UserId) -> Result<User, ActionError> {
    user_id
        .to_user(http)
        .await
        .inspect_err(|e| warn!(error = %e, user_id = %user_id, "report action user lookup from discord failed"))
        .map_err(|_| ActionError::Discord("That user could not be looked up.".to_string()))
}
