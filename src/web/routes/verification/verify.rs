use crate::core::config::get_settings;
use crate::utils::verification::verify_sig;
use crate::WebState;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use serenity::all::{GuildId, RoleId, UserId};
use std::env;
use std::sync::Arc;
use tracing::{debug, error};
use tracing::{info, warn};

#[derive(Deserialize, Debug)]
pub struct VerifyRequestPayload {
    user_id_str: String,
    guild_id_str: String,
    expires: u64,
    sig: String,
    turnstile_token: String,
}

#[derive(Deserialize, Debug)]
struct CloudflareResponse {
    success: bool,
    #[serde(rename = "error-codes")]
    error_codes: Option<Vec<String>>,
}

pub async fn handle_verify(
    State(state): State<Arc<WebState>>, Json(payload): Json<VerifyRequestPayload>,
) -> Result<StatusCode, (StatusCode, String)> {
    let Some(shared_secret) = state.shared_secret.as_deref() else {
        error!("VERIFICATION_SECRET environment variable is not set!");

        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            "Server configuration error. Please contact an administrator.".to_string()
        ));
    };

    let Some(cf_secret_key) = state.cf_secret_key.as_deref() else {
        error!("TURNSTILE_SECRET environment variable is not set!");

        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            "Server configuration error. Please contact an administrator.".to_string()
        ))
    };

    debug!(user_id = payload.user_id_str, "Verifying user with payload {:?}", payload);

    if !verify_sig(
        &payload.user_id_str, &payload.guild_id_str, payload.expires, &payload.sig, shared_secret.as_bytes()
    ) {
        info!(user_id = payload.user_id_str, "User failed to verify!");
        return Err((StatusCode::BAD_REQUEST, "Invalid or expired link.".to_string()));
    }

    let cf_verify_result = state.req_client
        .post("https://challenges.cloudflare.com/turnstile/v0/siteverify")
        .form(&[
            ("secret", cf_secret_key),
            ("response", payload.turnstile_token.as_str()),
        ]).send().await;

    match cf_verify_result {
        Ok(response) => {
            let cf_response: CloudflareResponse = response.json().await.unwrap_or(CloudflareResponse {
                success: false,
                error_codes: None,
            });

            if !cf_response.success {
                warn!("Turnstile rejected token. Errors: {:?}", cf_response.error_codes);
                return Err((StatusCode::BAD_REQUEST, "Turnstile verification failed.".to_string()));
            }
        }
        Err(e) => {
            warn!(error = ?e, "Cannot connect to Cloudflare");
            return Err((StatusCode::INTERNAL_SERVER_ERROR, "Failed to connect to Cloudflare.".to_string()));
        }
    }

    info!(user_id = payload.user_id_str, "User passed check!");

    // User has verified. Add role
    // I will put the getters after the verification to save HTTP requests.
    let db = &state.db;
    let redis = &state.redis;
    let cache = &state.guild_configs;
    let guild_id_u64 = payload.guild_id_str.parse::<u64>()
        .inspect_err(|e| warn!(error = ?e, guild_id_str = payload.guild_id_str, "Failed to parse guild ID"))
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid guild ID".to_string()))?;
    let user_id_u64 = payload.user_id_str.parse::<u64>()
        .inspect_err(|e| warn!(error = ?e, user_id_str = payload.user_id_str, "Failed to parse user ID"))
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid user ID".to_string()))?;

    let settings = get_settings(db, redis, cache, guild_id_u64 as i64).await
        .inspect_err(|e| warn!(error = ?e, "Failed to get guild config"))
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Failed to fetch config".to_string()))?;

    let Some(role_id_string) = settings.welcome
        .and_then(|w| w.verification)
        .and_then(|v| v.verification_role_id)
    else {
        warn!("Endpoint is fetched, but verification Role ID is empty");
        return Err((StatusCode::INTERNAL_SERVER_ERROR, "Verification Role ID is empty".to_string()));
    };

    let Ok(role_id_u64) = role_id_string.parse::<u64>().inspect_err(|e| {
        warn!(error = ?e, role_id_string = %role_id_string, "Verification Role ID is invalid");
    }) else {
        return Err((StatusCode::INTERNAL_SERVER_ERROR, "Verification Role ID is invalid".to_string()));
    };

    let role_id = RoleId::from(role_id_u64);
    let user_id = UserId::from(user_id_u64);
    let guild_id = GuildId::from(guild_id_u64);

    state.http.add_member_role(
        guild_id,
        user_id,
        role_id,
        Some("User successfully completed verification")
    )
        .await
        .inspect_err(|e| error!(error = ?e, "Failed to add role to user"))
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Failed to assign Discord role".to_string()))?;

    info!(user_id = payload.user_id_str, role_id = role_id_u64, "Added role to user");

    Ok(StatusCode::OK)
}