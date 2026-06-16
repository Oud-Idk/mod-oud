use axum::http::StatusCode;

pub async fn resolve_moderator_id(
    http: &poise::serenity_prelude::Http,
    moderator_id: Option<&str>,
) -> Result<poise::serenity_prelude::UserId, (StatusCode, String)> {
    let id_val = match moderator_id.and_then(|id| id.parse::<u64>().ok()) {
        Some(id) if id != 0 => id,
        _ => http
            .get_current_user()
            .await
            .map(|u| u.id.get())
            .map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Failed to fetch fallback bot details: {}", e),
                )
            })?,
    };
    Ok(poise::serenity_prelude::UserId::new(id_val))
}

pub async fn resolve_moderator_user(
    http: &poise::serenity_prelude::Http,
    moderator_id: Option<&str>,
) -> Result<poise::serenity_prelude::User, (StatusCode, String)> {
    let mod_id = resolve_moderator_id(http, moderator_id).await?;
    mod_id.to_user(http).await.map_err(|e| {
        (
            StatusCode::BAD_GATEWAY,
            format!("Failed to retrieve moderator details: {}", e),
        )
    })
}

pub async fn resolve_target_user(
    http: &poise::serenity_prelude::Http,
    user_id: poise::serenity_prelude::UserId,
) -> Result<poise::serenity_prelude::User, (StatusCode, String)> {
    user_id.to_user(http).await.map_err(|e| {
        (
            StatusCode::BAD_GATEWAY,
            format!("Failed to retrieve target user: {}", e),
        )
    })
}