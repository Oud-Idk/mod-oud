//! Middleware for protecting backend-to-backend routes with a shared secret.

use crate::core::config::state::WebState;
use axum::extract::Request;
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::Response;
use std::sync::Arc;
use tracing::warn;

/// Paths that bypass the internal secret check (public or ticket-authenticated).
const EXEMPT_PATHS: &[&str] = &[
    "/health",
    "/api/verify",
    "/api/ws/control",
    "/api/sse/events",
];

/// Axum middleware that enforces `Authorization: Bearer <INTERNAL_API_SECRET>`.
///
/// Used for all static backend to backend routes (embeds, tickets, etc.).
/// Rejects with 401 if header is missing/invalid, 500 if server is misconfigured.
/// Exempt paths (health, verify, ws, sse) are passed through. WS/SSE use
/// signed ticket verification instead (see `crate::web::ticket`).
pub async fn require_internal_secret(
    axum::extract::State(state): axum::extract::State<Arc<WebState>>,
    request: Request,
    next: Next,
) -> Result<Response, (StatusCode, String)> {
    let path = request.uri().path().to_string();
    if EXEMPT_PATHS.iter().any(|p| path == *p || path.starts_with(&format!("{p}?"))) {
        return Ok(next.run(request).await);
    }
    // Also allow nested /api prefix check for exempt subpaths
    if path.starts_with("/api/verify")
        || path.starts_with("/api/ws/control")
        || path.starts_with("/api/sse/events")
    {
        return Ok(next.run(request).await);
    }

    let Some(expected) = state.core.config.internal_api_secret.as_deref() else {
        warn!("INTERNAL_API_SECRET not set. Rejecting protected route {}", path);
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            "Server misconfigured".to_string(),
        ));
    };

    // Allow `Authorization: Bearer <token>` or `X-Internal-Secret: <token>` for flexibility.
    let provided = request
        .headers()
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| {
            if v.starts_with("Bearer ") {
                Some(v.trim_start_matches("Bearer ").trim())
            } else {
                Some(v.trim())
            }
        })
        .or_else(|| {
            request
                .headers()
                .get("x-internal-secret")
                .and_then(|v| v.to_str().ok())
                .map(str::trim)
        });

    match provided {
        Some(token) if token == expected => Ok(next.run(request).await),
        Some(_) => Err((StatusCode::UNAUTHORIZED, "Invalid internal secret".to_string())),
        None => Err((StatusCode::UNAUTHORIZED, "Missing Authorization".to_string())),
    }
}
