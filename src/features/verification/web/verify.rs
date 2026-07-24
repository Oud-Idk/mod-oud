use crate::core::config::state::WebState;
use crate::core::config::settings::get_settings;
use crate::features::verification::captcha::{verify_hcaptcha_token, verify_turnstile};
use crate::features::verification::signing::verify_sig;
use crate::features::verification::types::CaptchaType;
use axum::Json;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use serde::Deserialize;
use serenity::all::{GuildId, RoleId, UserId};
use std::sync::Arc;
use tracing::{debug, error, info, warn};

#[derive(Deserialize, Debug)]
pub struct VerifyRequestPayload {
    user_id_str: String,
    guild_id_str: String,
    expires: u64,
    sig: String,
    access_token: Option<String>,

    captcha_token: String,
    captcha_type: CaptchaType,
}

#[derive(Deserialize)]
struct DiscordUser {
    id: String,
}

pub async fn handle_verify(
    State(state): State<Arc<WebState>>,
    headers: HeaderMap,
    Json(payload): Json<VerifyRequestPayload>,
) -> Result<StatusCode, (StatusCode, String)> {
    let guild_id_str = &payload.guild_id_str;
    let guild_id_u64 = guild_id_str.parse::<u64>()
        .inspect_err(|e| warn!(error = ?e, guild_id_str = guild_id_str, "Failed to parse guild ID"))
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid Guild ID format".to_string()))?;

    let client_ip = headers
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok())
        .and_then(|s| s.split(',').next())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "127.0.0.1".to_string());


    let (shared_secret, cf_secret_key, hc_secret_key, hc_site_key) = get_secrets(&state)?;

    debug!(user_id = payload.user_id_str, "Verifying user with payload {:?}", payload);

    if !verify_sig(
        &payload.user_id_str, guild_id_str, payload.expires, &payload.sig, shared_secret.as_bytes()
    ) {
        info!(user_id = payload.user_id_str, "User failed to verify!");
        return Err((StatusCode::BAD_REQUEST, "Invalid or expired link.".to_string()));
    }

    let settings = get_settings(&state.db, &state.redis, &state.guild_configs, guild_id_u64 as i64).await
        .inspect_err(|e| warn!(error = ?e, "Failed to get settings!"))
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Couldn't get settings.".to_string()))?;

    let maybe_verification = settings.welcome
        .as_ref()
        .and_then(|w| w.verification.as_ref());

    let captcha_type = maybe_verification.and_then(
        |t| t.captcha_type.as_ref()
    );

    if Some(&payload.captcha_type) != captcha_type {
        warn!("Captcha type does not match! Expected {:?}, got {:?}", Some(&payload.captcha_type), &captcha_type);
        return Err((StatusCode::BAD_REQUEST, "Captcha type does not match.".to_string()));
    }

    let use_auth = maybe_verification
        .and_then(|v| v.use_oauth)
        .unwrap_or(false);

    if use_auth {
        let Some(token) = &payload.access_token else {
            debug!(use_auth, user_id = payload.user_id_str, "User tried to verify without authentication");
            return Err((StatusCode::UNAUTHORIZED, "Discord authentication required.".to_string()));
        };

        let discord_res = state.req_client
            .get("https://discord.com/api/users/@me")
            .bearer_auth(token)
            .send()
            .await;

        match discord_res {
            Ok(resp) if resp.status().is_success() => {
                let discord_user: DiscordUser = resp.json().await
                    .map_err(|e| {
                        warn!(error = ?e, "Failed to parse Discord user JSON");
                        (StatusCode::INTERNAL_SERVER_ERROR, "Discord API error".to_string())
                    })?;
                if discord_user.id != payload.user_id_str {
                    warn!("User ID mismatch! URL ID: {}, Auth ID: {}", payload.user_id_str, discord_user.id);
                    return Err((StatusCode::FORBIDDEN, "You logged into the wrong Discord account!".to_string()));
                }
            }
            _ => {
                return Err((StatusCode::UNAUTHORIZED, "Invalid or expired Discord session. Please log in again.".to_string()));
            }
        }
    }

    let verified;
    let reject_reasons;

    match payload.captcha_type {
        CaptchaType::Turnstile => {
            (verified, reject_reasons) = verify_turnstile(&state.req_client, cf_secret_key, payload.captcha_token.as_str()).await
                .inspect_err(|e| warn!(error = ?e, "Failed to verify using Turnstile"))
                .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Failed to verify using Turnstile.".to_string()))?;
        }
        CaptchaType::HCaptcha => {
            (verified, reject_reasons) = verify_hcaptcha_token(&payload.captcha_token, &client_ip, &state.req_client, hc_secret_key, hc_site_key).await
                .inspect_err(|e| warn!(error = ?e, "Failed to verify using hCaptcha"))
                .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Failed to verify using hCaptcha.".to_string()))?;
        }
    }

    if !verified {
        debug!(user_id = payload.user_id_str, reject_reasons = ?reject_reasons, "Captcha failed");
        return Err((StatusCode::BAD_REQUEST, "hCaptcha verification failed.".to_string()));
    }

    info!(user_id = payload.user_id_str, "User passed check!");

    // User has verified. Add role
    // I will put the getters after the verification to save HTTP requests.
    let user_id_u64 = payload.user_id_str.parse::<u64>()
        .inspect_err(|e| warn!(error = ?e, user_id_str = payload.user_id_str, "Failed to parse user ID"))
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid user ID".to_string()))?;

    let Some(role_id_string) = maybe_verification
        .and_then(|v| v.verification_role_id.as_deref())
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

fn get_secrets(state: &Arc<WebState>) -> Result<(&str, &str, &str, &str), (StatusCode, String)> {
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

    let Some(hc_secret_key) = state.hc_secret_key.as_deref() else {
        error!("HCAPTCHA_SECRET environment variable is not set!");

        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            "Server configuration error. Please contact an administrator.".to_string()
        ))
    };

    let Some(hc_site_key) = state.hc_site_key.as_deref() else {
        error!("HCAPTCHA_SITE_KEY environment variable is not set!");

        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            "Server configuration error. Please contact an administrator.".to_string()
        ))
    };
    Ok((shared_secret, cf_secret_key, hc_secret_key, hc_site_key))
}