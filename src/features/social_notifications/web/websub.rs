//! Public `WebSub` hub callbacks.
//!
//! These are called by third-party hubs, not the dashboard, so they authenticate
//! with a per-feed HMAC signature instead of the internal API secret. They are
//! mounted at the site root (not under `/api`) to match `{DOMAIN}/websub/{feed_id}`.

use crate::core::config::state::WebState;
use crate::features::social_notifications::database;
use crate::features::social_notifications::database::get_subscribed_channels;
use crate::features::social_notifications::discovery::{derive_feed_secret, verify_signature};
use crate::features::social_notifications::embed::build_entry_embed;
use axum::body::Bytes;
use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use chrono::{Duration, Utc};
use reqwest::StatusCode;
use serde::Deserialize;
use serenity::all::CreateMessage;
use std::sync::Arc;
use tracing::{debug, error, warn};
use uuid::Uuid;

/// Query parameters a hub sends when verifying (or denying) a subscription.
#[derive(Debug, Deserialize)]
pub struct WebSubVerifyParams {
    #[serde(rename = "hub.mode")]
    pub mode: String,

    #[serde(rename = "hub.topic")]
    #[allow(dead_code)]
    pub topic: String,

    #[serde(rename = "hub.challenge")]
    pub challenge: Option<String>,

    #[serde(rename = "hub.lease_seconds")]
    pub lease_seconds: Option<i64>,

    #[serde(rename = "hub.reason")]
    pub reason: Option<String>,
}

pub async fn websub_notify(
    Path(feed_id): Path<Uuid>,
    State(state): State<Arc<WebState>>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<StatusCode, (StatusCode, String)> {
    let internal_api_secret = state
        .core
        .config
        .internal_api_secret
        .as_deref()
        .ok_or_else(|| {
            error!(
                fault = "INTERNAL_API_SECRET is not set",
                "internal API secret is not set up, but the WebSub endpoint is still called"
            );
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Internal Server Error".into(),
            )
        })?;
    let expected_secret = derive_feed_secret(internal_api_secret, &feed_id);

    let signature_header = headers
        .get("X-Hub-Signature")
        .or_else(|| headers.get("X-Hub-Signature-256"))
        .and_then(|h| h.to_str().ok());

    let Some(signature) = signature_header else {
        debug!(feed_id = %feed_id, "rejected WebSub POST: Missing X-Hub-Signature header");
        return Err((StatusCode::UNAUTHORIZED, "Missing signature header".into()));
    };

    if !verify_signature(&expected_secret, signature, &body) {
        debug!(feed_id = %feed_id, "rejected WebSub POST: Invalid cryptographic signature");
        return Err((StatusCode::UNAUTHORIZED, "Invalid signature".into()));
    }

    let Ok(feed) = feed_rs::parser::parse(&body[..]) else {
        debug!(feed_id = %feed_id, "dropped WebSub POST: body is not a parseable feed");
        return Ok(StatusCode::OK);
    };

    let Some(entry) = feed.entries.first() else {
        debug!(%feed_id, "websub payload contained no entries");
        return Ok(StatusCode::OK);
    };

    let subscribed_channels = get_subscribed_channels(&state.core.db, feed_id)
        .await
        .inspect_err(|e| warn!(%feed_id, error = ?e, "subscribed channel lookup failed"))
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Internal server error".to_string(),
            )
        })?;

    // Build the embed once outside the loop, then clone it per channel!
    let embed = build_entry_embed(entry);

    for channel in subscribed_channels {
        let msg = CreateMessage::new().embed(embed.clone());
        if let Err(e) = channel.send_message(&state.serenity_http, msg).await {
            warn!(
                error = ?e,
                %feed_id,
                %channel,
                "WebSub entry delivery failed; the subscriber missed this post"
            );
        }
    }

    Ok(StatusCode::OK)
}

pub async fn websub_verify(
    Path(feed_id): Path<Uuid>,
    State(state): State<Arc<WebState>>,
    Query(params): Query<WebSubVerifyParams>,
) -> Result<String, (StatusCode, &'static str)> {
    // Check if the hub denied the subscription
    if params.mode == "denied" {
        error!(
            feed_id = %feed_id,
            reason = ?params.reason,
            "WebSub subscription denied by the hub"
        );
        // Per spec: acknowledge denial with 200 OK
        return Ok("ack".to_string());
    }

    // Must be a subscribe (or unsubscribe) request
    if params.mode != "subscribe" && params.mode != "unsubscribe" {
        debug!(feed_id = %feed_id, mode = %params.mode, "rejected WebSub verification: unknown hub.mode received");
        return Err((StatusCode::BAD_REQUEST, "Invalid hub.mode"));
    }

    // The challenge must be present
    let Some(challenge) = params.challenge else {
        debug!(feed_id = %feed_id, "rejected WebSub verification: missing hub.challenge");
        return Err((StatusCode::BAD_REQUEST, "Missing hub.challenge"));
    };

    let feed_exists = database::check_if_feed_exists(feed_id, &state.core.db).await;

    let feed_exists = feed_exists
        .inspect_err(|e| warn!(error = ?e, feed_id = %feed_id, "feed existence check failed"))
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error"))?
        .unwrap_or(false);

    if !feed_exists {
        debug!(feed_id = %feed_id, "rejected WebSub verification for non-existent feed");
        return Err((StatusCode::NOT_FOUND, "Feed not found"));
    }

    if let Some(secs) = params.lease_seconds {
        let expires_at = Utc::now() + Duration::seconds(secs);

        let _ = database::update_lease(&state.core.db, feed_id, expires_at)
            .await
            .inspect_err(|e| error!(error = ?e, feed_id = %feed_id, "WebSub lease update failed"))
            .inspect(|()| debug!(feed_id = %feed_id, lease_seconds = secs, %expires_at, "WebSub lease verified and saved"));
    }

    debug!(feed_id = %feed_id, "WebSub challenge returned to the hub");

    Ok(challenge)
}
