use axum::http::StatusCode;
use poise::serenity_prelude::{Http, User, UserId};
use tracing::{instrument, warn};

#[instrument(skip(http))]
pub async fn resolve_moderator_id(
    http: &Http,
    moderator_id: Option<UserId>,
) -> Result<UserId, (StatusCode, String)> {
    match moderator_id {
        Some(id) => Ok(id),
        None => http
            .get_current_user()
            .await
            .map(|u| u.id)
            .inspect_err(
                |e| warn!(error = %e, "Failed to fetch fallback bot details from Discord API"),
            )
            .map_err(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Internal server error.".to_string(),
                )
            }),
    }
}

#[instrument(skip(http))]
pub async fn resolve_moderator_user(
    http: &Http,
    moderator_id: Option<UserId>,
) -> Result<User, (StatusCode, String)> {
    let mod_id = resolve_moderator_id(http, moderator_id).await?;
    mod_id
        .to_user(http)
        .await
        .inspect_err(|e| warn!(error = %e, %mod_id, "Failed to retrieve moderator user details from Discord API"))
        .map_err(|_| (StatusCode::BAD_GATEWAY, "Failed to retrieve moderator details.".to_string()))
}

#[instrument(skip(http))]
pub async fn resolve_target_user(
    http: &Http,
    user_id: UserId,
) -> Result<User, (StatusCode, String)> {
    user_id
        .to_user(http)
        .await
        .inspect_err(|e| warn!(error = %e, %user_id, "Failed to retrieve target user details from Discord API"))
        .map_err(|_| (StatusCode::BAD_GATEWAY, "Failed to retrieve target user".to_string()))
}
