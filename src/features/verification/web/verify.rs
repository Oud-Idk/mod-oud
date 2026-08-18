use crate::core::config::settings::get_settings;
use crate::core::config::state::WebState;
use crate::features::verification::captcha::{verify_hcaptcha_token, verify_turnstile};
use crate::features::verification::signing::verify_sig;
use crate::features::verification::types::CaptchaType;
use axum::Json;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use serde::Deserialize;
use serde_with::{DisplayFromStr, serde_as};
use serenity::all::{GuildId, UserId};
use std::sync::Arc;
use tracing::{debug, error, info, warn};

#[serde_as]
#[derive(Deserialize, Debug)]
pub struct VerifyRequestPayload {
    #[serde_as(as = "DisplayFromStr")]
    pub user_id: UserId,
    #[serde_as(as = "DisplayFromStr")]
    pub guild_id: GuildId,
    pub expires: u64,
    pub sig: String,
    pub access_token: Option<String>,

    pub captcha_token: String,
    pub captcha_type: CaptchaType,
}

#[serde_as]
#[derive(Deserialize)]
struct DiscordUser {
    #[serde_as(as = "DisplayFromStr")]
    pub id: UserId,
}

pub async fn handle_verify(
    State(state): State<Arc<WebState>>,
    headers: HeaderMap,
    Json(payload): Json<VerifyRequestPayload>,
) -> Result<StatusCode, (StatusCode, String)> {
    let client_ip = headers
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok())
        .and_then(|s| s.split(',').next())
        .map_or_else(|| "127.0.0.1".to_string(), |s| s.trim().to_string());

    let (shared_secret, cf_secret_key, hc_secret_key, hc_site_key) = get_secrets(&state)?;

    debug!(user_id = %payload.user_id, "Verifying user with payload {:?}", payload);

    // Pass string representations directly using `.to_string()` or format
    if !verify_sig(
        &payload.user_id.to_string(),
        &payload.guild_id.to_string(),
        payload.expires,
        &payload.sig,
        shared_secret.as_bytes(),
    ) {
        info!(user_id = %payload.user_id, "User failed to verify!");
        return Err((
            StatusCode::BAD_REQUEST,
            "Invalid or expired link.".to_string(),
        ));
    }

    let settings = get_settings(
        &state.core.db,
        &state.core.redis,
        &state.core.guild_configs_cache,
        payload.guild_id,
    )
    .await
    .inspect_err(|e| warn!(error = ?e, "Failed to get settings!"))
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Internal server error.".to_string(),
        )
    })?;

    let maybe_verification = settings
        .welcome
        .as_ref()
        .and_then(|w| w.verification.as_ref());

    let captcha_type = maybe_verification.and_then(|t| t.captcha_type.as_ref());

    if Some(&payload.captcha_type) != captcha_type {
        warn!(
            "Captcha type does not match! Expected {:?}, got {:?}",
            Some(&payload.captcha_type),
            &captcha_type
        );
        return Err((
            StatusCode::BAD_REQUEST,
            "Captcha type does not match.".to_string(),
        ));
    }

    let use_auth = maybe_verification
        .and_then(|v| v.use_oauth)
        .unwrap_or(false);

    if use_auth {
        let Some(token) = &payload.access_token else {
            debug!(use_auth, user_id = %payload.user_id, "User tried to verify without authentication");
            return Err((
                StatusCode::UNAUTHORIZED,
                "Discord authentication required.".to_string(),
            ));
        };

        let discord_res = state
            .core
            .reqwest_client
            .get("https://discord.com/api/users/@me")
            .bearer_auth(token)
            .send()
            .await;

        match discord_res {
            Ok(resp) if resp.status().is_success() => {
                let discord_user: DiscordUser = resp.json().await.map_err(|e| {
                    warn!(error = ?e, "Failed to parse Discord user JSON");
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "Internal server error.".to_string(),
                    )
                })?;
                // Strong type equality comparison
                if discord_user.id != payload.user_id {
                    warn!(
                        "User ID mismatch! URL ID: {}, Auth ID: {}",
                        payload.user_id, discord_user.id
                    );
                    return Err((
                        StatusCode::FORBIDDEN,
                        "You logged into the wrong Discord account!".to_string(),
                    ));
                }
            }
            _ => {
                return Err((
                    StatusCode::UNAUTHORIZED,
                    "Invalid or expired Discord session. Please log in again.".to_string(),
                ));
            }
        }
    }

    let verified;
    let reject_reasons;

    match payload.captcha_type {
        CaptchaType::Turnstile => {
            (verified, reject_reasons) = verify_turnstile(
                &state.core.reqwest_client,
                cf_secret_key,
                payload.captcha_token.as_str(),
            )
            .await
            .inspect_err(|e| warn!(error = ?e, "Failed to verify using Turnstile"))
            .map_err(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Internal server error.".to_string(),
                )
            })?;
        }
        CaptchaType::HCaptcha => {
            (verified, reject_reasons) = verify_hcaptcha_token(
                &payload.captcha_token,
                &client_ip,
                &state.core.reqwest_client,
                hc_secret_key,
                hc_site_key,
            )
            .await
            .inspect_err(|e| warn!(error = ?e, "Failed to verify using hCaptcha"))
            .map_err(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Internal server error.".to_string(),
                )
            })?;
        }
    }

    if !verified {
        debug!(user_id = %payload.user_id, reject_reasons = ?reject_reasons, "Captcha failed");
        return Err((
            StatusCode::BAD_REQUEST,
            "hCaptcha verification failed.".to_string(),
        ));
    }

    info!(user_id = %payload.user_id, "User passed check!");

    let Some(role_id) = maybe_verification.and_then(|v| v.verification_role_id) else {
        warn!("Endpoint is fetched, but verification Role ID is empty");
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            "Internal server error".to_string(),
        ));
    };

    // No late parsing required!
    state
        .serenity_http
        .add_member_role(
            payload.guild_id,
            payload.user_id,
            role_id,
            Some("User successfully completed verification"),
        )
        .await
        .inspect_err(|e| error!(error = ?e, "Failed to add role to user"))
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Internal server error".to_string(),
            )
        })?;

    info!(user_id = %payload.user_id, %role_id, "Added role to user");

    Ok(StatusCode::OK)
}

fn get_secrets(state: &Arc<WebState>) -> Result<(&str, &str, &str, &str), (StatusCode, String)> {
    let Some(shared_secret) = state.core.config.shared_secret.as_deref() else {
        error!("VERIFICATION_SECRET environment variable is not set!");

        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            "Internal server error.".to_string(),
        ));
    };

    let Some(cf_secret_key) = state.core.config.cf_secret_key.as_deref() else {
        error!("TURNSTILE_SECRET environment variable is not set!");

        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            "Internal server error.".to_string(),
        ));
    };

    let Some(hc_secret_key) = state.core.config.hc_secret_key.as_deref() else {
        error!("HCAPTCHA_SECRET environment variable is not set!");

        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            "Internal server error.".to_string(),
        ));
    };

    let Some(hc_site_key) = state.core.config.hc_site_key.as_deref() else {
        error!("HCAPTCHA_SITE_KEY environment variable is not set!");

        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            "Internal server error.".to_string(),
        ));
    };
    Ok((shared_secret, cf_secret_key, hc_secret_key, hc_site_key))
}
