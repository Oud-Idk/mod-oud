use axum::http::StatusCode;
use tracing::{instrument, warn};

#[instrument(skip(http))]
pub async fn resolve_moderator_id(
    http: &poise::serenity_prelude::Http,
    moderator_id: Option<i64>,
) -> Result<poise::serenity_prelude::UserId, (StatusCode, String)> {
    let id_val = match moderator_id.map(|id| id as u64) {
        Some(id) if id != 0 => id,
        _ => http
            .get_current_user()
            .await
            .map(|u| u.id.get())
            .inspect_err(|e| warn!(error = %e, "Failed to fetch fallback bot details from Discord API"))
            .map_err(|_e| (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error.".to_string()))?,
    };
    Ok(poise::serenity_prelude::UserId::new(id_val))
}

#[instrument(skip(http))]
pub async fn resolve_moderator_user(
    http: &poise::serenity_prelude::Http,
    moderator_id: Option<i64>,
) -> Result<poise::serenity_prelude::User, (StatusCode, String)> {
    let mod_id = resolve_moderator_id(http, moderator_id).await?;
    mod_id.to_user(http).await
        .inspect_err(|e| warn!(error = %e, %mod_id, "Failed to retrieve moderator user details from Discord API"))
        .map_err(|_e| (StatusCode::BAD_GATEWAY, "Failed to retrieve moderator details.".to_string()))
}

#[instrument(skip(http))]
pub async fn resolve_target_user(
    http: &poise::serenity_prelude::Http,
    user_id: poise::serenity_prelude::UserId,
) -> Result<poise::serenity_prelude::User, (StatusCode, String)> {
    user_id.to_user(http).await
        .inspect_err(|e| warn!(error = %e, %user_id, "Failed to retrieve target user details from Discord API"))
        .map_err(|_e| (StatusCode::BAD_GATEWAY, "Failed to retrieve target user".to_string()))
}