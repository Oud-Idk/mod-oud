use crate::core::config::settings::{GuildSettings, get_settings};
use crate::core::config::state::WebState;
use crate::features::verification::audit;
use crate::features::verification::captcha::{verify_hcaptcha_token, verify_turnstile};
use crate::features::verification::signing::verify_sig;
use crate::features::verification::types::CaptchaType;
use axum::Json;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use serde::Deserialize;
use serde_with::{DisplayFromStr, serde_as};
use serenity::all::{GuildId, RoleId, UserId};
use std::sync::Arc;
use tracing::{debug, error, warn};

type WebResult<T = StatusCode> = Result<T, (StatusCode, String)>;

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

struct VerificationSecrets<'a> {
    shared_secret: &'a str,
    cf_secret_key: &'a str,
    hc_secret_key: &'a str,
    hc_site_key: &'a str,
}

pub async fn handle_verify(
    State(state): State<Arc<WebState>>,
    headers: HeaderMap,
    Json(payload): Json<VerifyRequestPayload>,
) -> WebResult {
    let client_ip = extract_client_ip(&headers);
    let secrets = get_secrets(&state)?;

    // Not the whole payload: it carries `sig`, `access_token` and `captcha_token`.
    debug!(
        guild_id = %payload.guild_id,
        user_id = %payload.user_id,
        captcha_type = ?payload.captcha_type,
        expires = payload.expires,
        "verifying user"
    );

    // Verify URL signature integrity
    if !verify_sig(
        &payload.user_id.to_string(),
        &payload.guild_id.to_string(),
        payload.expires,
        &payload.sig,
        secrets.shared_secret.as_bytes(),
    ) {
        debug!(user_id = %payload.user_id, "verification link invalid or expired");
        return Err((
            StatusCode::BAD_REQUEST,
            "Invalid or expired link.".to_string(),
        ));
    }

    // Fetch guild settings & validation config
    let settings = fetch_guild_settings(&state, payload.guild_id).await?;
    let verification_cfg = settings
        .verification_settings()
        .filter(|v| v.captcha_type.as_ref() == Some(&payload.captcha_type))
        .ok_or_else(|| {
            debug!(
                guild_id = %payload.guild_id,
                "rejected verification: captcha type mismatch or verification not configured for guild"
            );
            (
                StatusCode::BAD_REQUEST,
                "Captcha type does not match.".to_string(),
            )
        })?;

    // Authenticate with Discord OAuth if required
    if verification_cfg.use_oauth.unwrap_or(false) {
        verify_discord_oauth_identity(&state, &payload).await?;
    }

    // Validate Captcha (Turnstile / hCaptcha)
    validate_captcha(&state, &payload, &secrets, &client_ip).await?;

    debug!(
        guild_id = %payload.guild_id,
        user_id = %payload.user_id,
        "verification checks passed"
    );

    // Assign verified role to the user
    let role_id = verification_cfg.verification_role_id.ok_or_else(|| {
        error!(
            fault = "verification role id is not configured for this guild",
            guild_id = %payload.guild_id,
            "verification role id not configured"
        );
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Internal server error".to_string(),
        )
    })?;

    assign_verified_role(&state, payload.guild_id, payload.user_id, role_id).await?;

    Ok(StatusCode::OK)
}

/// Extracts client IP from `x-forwarded-for` header with fallback to localhost.
fn extract_client_ip(headers: &HeaderMap) -> String {
    headers
        .get("x-forwarded-for")
        .and_then(|val| val.to_str().ok())
        .and_then(|s| s.split(',').next())
        .map_or_else(|| "127.0.0.1".to_string(), |s| s.trim().to_string())
}

/// Retrieves all required API secrets from app state config.
fn get_secrets(state: &Arc<WebState>) -> WebResult<VerificationSecrets<'_>> {
    let config = &state.core.config;

    let shared_secret = config.shared_secret.as_deref().ok_or_else(|| {
        error!(
            fault = "VERIFICATION_SECRET is not set",
            "captcha verification unavailable"
        );
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Internal server error.".to_string(),
        )
    })?;

    let cf_secret_key = config.cf_secret_key.as_deref().ok_or_else(|| {
        error!(
            fault = "TURNSTILE_SECRET is not set",
            "captcha verification unavailable"
        );
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Internal server error.".to_string(),
        )
    })?;

    let hc_secret_key = config.hc_secret_key.as_deref().ok_or_else(|| {
        error!(
            fault = "HCAPTCHA_SECRET is not set",
            "captcha verification unavailable"
        );
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Internal server error.".to_string(),
        )
    })?;

    let hc_site_key = config.hc_site_key.as_deref().ok_or_else(|| {
        error!(
            fault = "HCAPTCHA_SITE_KEY is not set",
            "captcha verification unavailable"
        );
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Internal server error.".to_string(),
        )
    })?;

    Ok(VerificationSecrets {
        shared_secret,
        cf_secret_key,
        hc_secret_key,
        hc_site_key,
    })
}

/// Fetches guild settings with internal server error fallback.
async fn fetch_guild_settings(
    state: &Arc<WebState>,
    guild_id: GuildId,
) -> WebResult<GuildSettings> {
    get_settings(
        &state.core.db,
        &state.core.redis,
        &state.core.guild_configs_cache,
        guild_id,
    )
    .await
    .inspect_err(|e| warn!(error = ?e, %guild_id, "guild settings lookup failed"))
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Internal server error.".to_string(),
        )
    })
}

/// Verifies that the OAuth token belongs to the matching user ID.
async fn verify_discord_oauth_identity(
    state: &Arc<WebState>,
    payload: &VerifyRequestPayload,
) -> WebResult<()> {
    let Some(token) = &payload.access_token else {
        debug!(user_id = %payload.user_id, "verification attempted without an access token");
        return Err((
            StatusCode::UNAUTHORIZED,
            "Discord authentication required.".to_string(),
        ));
    };

    let response = state
        .core
        .reqwest_client
        .get("https://discord.com/api/users/@me")
        .bearer_auth(token)
        .send()
        .await;

    match response {
        Ok(resp) if resp.status().is_success() => {
            let discord_user: DiscordUser = resp.json().await.map_err(|e| {
                warn!(error = ?e, %payload.user_id, "discord user json parse failed");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Internal server error.".to_string(),
                )
            })?;

            if discord_user.id != payload.user_id {
                debug!(
                    user_id = %payload.user_id,
                    auth_user_id = %discord_user.id,
                    "rejected verification: link and authenticated Discord account differ"
                );
                return Err((
                    StatusCode::FORBIDDEN,
                    "You logged into the wrong Discord account!".to_string(),
                ));
            }
            Ok(())
        }
        Ok(resp) => {
            debug!(
                status = %resp.status(),
                "rejected verification: Discord refused the supplied access token"
            );
            Err((
                StatusCode::UNAUTHORIZED,
                "Invalid or expired Discord session. Please log in again.".to_string(),
            ))
        }
        Err(e) => {
            warn!(
                error = ?e,
                %payload.user_id,
                "access token validation request to discord failed"
            );
            Err((
                StatusCode::UNAUTHORIZED,
                "Invalid or expired Discord session. Please log in again.".to_string(),
            ))
        }
    }
}

/// Verifies Turnstile or hCaptcha token.
async fn validate_captcha(
    state: &Arc<WebState>,
    payload: &VerifyRequestPayload,
    secrets: &VerificationSecrets<'_>,
    client_ip: &str,
) -> WebResult<()> {
    let (verified, reject_reasons) = match payload.captcha_type {
        CaptchaType::Turnstile => verify_turnstile(
            &state.core.reqwest_client,
            secrets.cf_secret_key,
            &payload.captcha_token,
        )
        .await
        .inspect_err(|e| warn!(error = ?e, %payload.user_id, "turnstile verification failed"))
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Internal server error.".to_string(),
            )
        })?,

        CaptchaType::HCaptcha => verify_hcaptcha_token(
            &payload.captcha_token,
            client_ip,
            &state.core.reqwest_client,
            secrets.hc_secret_key,
            secrets.hc_site_key,
        )
        .await
        .inspect_err(|e| warn!(error = ?e, %payload.user_id, "hcaptcha verification failed"))
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Internal server error.".to_string(),
            )
        })?,
    };

    if !verified {
        debug!(user_id = %payload.user_id, reject_reasons = ?reject_reasons, "captcha failed");
        return Err((
            StatusCode::BAD_REQUEST,
            "Captcha verification failed.".to_string(),
        ));
    }

    Ok(())
}

/// Adds the verified role to the user in Serenity HTTP.
async fn assign_verified_role(
    state: &Arc<WebState>,
    guild_id: GuildId,
    user_id: UserId,
    role_id: RoleId,
) -> WebResult<()> {
    state
        .serenity_http
        .add_member_role(
            guild_id,
            user_id,
            role_id,
            Some("User successfully completed verification"),
        )
        .await
        .inspect_err(|e| warn!(error = ?e, %guild_id, %user_id, "verification role not added"))
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Internal server error".to_string(),
            )
        })?;

    audit::role_granted(guild_id, user_id, role_id);
    Ok(())
}
