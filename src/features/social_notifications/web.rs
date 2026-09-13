use crate::constants::BRAND_COLOR;
use crate::core::config::state::WebState;
use crate::features::social_notifications::database;
use crate::features::social_notifications::database::get_subscribed_channels;
use axum::extract::Query;
use axum::{Router, extract::{Path, State}};
use chrono::{Duration, Utc};
use reqwest::StatusCode;
use serde::Deserialize;
use serenity::all::{CreateEmbed, CreateMessage};
use std::sync::Arc;
use axum::body::Bytes;
use axum::http::HeaderMap;
use axum::routing::get;
use tracing::{debug, error, info, warn};
use uuid::Uuid;
use crate::features::social_notifications::discovery::{derive_feed_secret, verify_signature};

async fn websub_notify(
    Path(feed_id): Path<Uuid>,
    State(state): State<Arc<WebState>>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<StatusCode, (StatusCode, String)> {
    let internal_api_secret = state.core.config.internal_api_secret.as_deref()
        .ok_or_else( || {
            warn!("Internal API secret is not set up, but the WebSub endpoint is still called!");
            (StatusCode::INTERNAL_SERVER_ERROR, "Internal Server Error".into())
        })?;
    let expected_secret = derive_feed_secret(internal_api_secret, &feed_id);

    let signature_header = headers
        .get("X-Hub-Signature")
        .or_else(|| headers.get("X-Hub-Signature-256"))
        .and_then(|h| h.to_str().ok());

    let Some(signature) = signature_header else {
        warn!(feed_id = %feed_id, "Rejecting WebSub POST: Missing X-Hub-Signature header");
        return Err((StatusCode::UNAUTHORIZED, "Missing signature header".into()));
    };

    if !verify_signature(&expected_secret, signature, &body) {
        warn!(feed_id = %feed_id, "Rejecting WebSub POST: Invalid cryptographic signature!");
        return Err((StatusCode::UNAUTHORIZED, "Invalid signature".into()));
    }

    let Ok(feed) = feed_rs::parser::parse(&body[..]) else {
        return Ok(StatusCode::OK);
    };


    let Some(entry) = feed.entries.first() else {
        debug!("WebSub payload contained no entries for feed {}", feed_id);
        return Ok(StatusCode::OK);
    };

    let title = entry.title.as_ref().map_or("New Post", |t| &t.content);
    let link = entry.links.first().map_or("", |l| &l.href);

    let subscribed_channels = get_subscribed_channels(&state.core.db, feed_id)
        .await
        .inspect_err(|e| error!(error = ?e, "Error getting subscribed channels"))
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string()))?;

    // Build the embed once outside the loop, then clone it per channel!
    let embed = CreateEmbed::new()
        .title(title)
        .url(link)
        .color(BRAND_COLOR);

    for channel in subscribed_channels {
        let msg = CreateMessage::new().embed(embed.clone());
        let _ = channel.send_message(&state.serenity_http, msg).await;
    }

    Ok(StatusCode::OK)
}

#[derive(Debug, Deserialize)]
struct WebSubVerifyParams {
    #[serde(rename = "hub.mode")]
    pub mode: String,

    #[serde(rename = "hub.topic")]
    pub topic: String,

    #[serde(rename = "hub.challenge")]
    pub challenge: Option<String>,

    #[serde(rename = "hub.lease_seconds")]
    pub lease_seconds: Option<i64>,

    #[serde(rename = "hub.reason")]
    pub reason: Option<String>,
}

async fn websub_verify(
    Path(feed_id): Path<Uuid>,
    State(state): State<Arc<WebState>>,
    Query(params): Query<WebSubVerifyParams>,
) -> Result<String, (StatusCode, &'static str)> {
    // Check if the hub denied the subscription
    if params.mode == "denied" {
        warn!(
            feed_id = %feed_id,
            reason = ?params.reason,
            "WebSub subscription was DENIED by the hub"
        );
        // Per spec: acknowledge denial with 200 OK
        return Ok("ack".to_string());
    }

    // Must be a subscribe (or unsubscribe) request
    if params.mode != "subscribe" && params.mode != "unsubscribe" {
        warn!(mode = %params.mode, "Unknown hub.mode received");
        return Err((StatusCode::BAD_REQUEST, "Invalid hub.mode"));
    }

    // The challenge must be present
    let Some(challenge) = params.challenge else {
        warn!("Missing hub.challenge in verification request");
        return Err((StatusCode::BAD_REQUEST, "Missing hub.challenge"));
    };

    let feed_exists = database::check_if_feed_exists(feed_id, &state.core.db).await;

    let feed_exists = feed_exists.inspect_err(|e| error!(error = ?e, "Failed checking feed existence"))
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error"))?
        .unwrap_or(false);

    if !feed_exists {
        warn!(feed_id = %feed_id, "Verification attempted for non-existent feed");
        return Err((StatusCode::NOT_FOUND, "Feed not found"));
    }

    if let Some(secs) = params.lease_seconds {
        let expires_at = Utc::now() + Duration::seconds(secs);

        let _ = database::update_lease(&state.core.db, feed_id, expires_at).await
            .inspect_err(|e| error!(error = ?e, "Error updating lease"))
            .inspect(|_| info!(feed_id = %feed_id, lease_seconds = secs, %expires_at, "WebSub lease verified and saved."));
    }

    info!(feed_id = %feed_id, "Echoing challenge back to WebSub hub.");

    Ok(challenge)
}

/// Registers the WebSub routes for notifications.
pub fn routes() -> Router<Arc<WebState>> {
    Router::new()
        .route("/websub/{feed_id}", get(websub_verify).post(websub_notify))
}