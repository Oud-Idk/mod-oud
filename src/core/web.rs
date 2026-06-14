use crate::types::types::{DeletedMessagePayload, Error, LogEvent, ModifiedMessagePayload, ReportedMessagePayload};
use crate::WebState;
use axum::extract::{Query, State};
use axum::http::{HeaderValue, Method};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::routing::method_routing::get;
use axum::routing::Router;
use serde::Deserialize;
use std::convert::Infallible;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::broadcast;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::Stream;
use tokio_stream::StreamExt;
use tower_http::cors::CorsLayer;

// Clean centralized configuration for incoming Redis events
impl LogEvent {
    // List of all Redis channels to subscribe to
    pub const REDIS_CHANNELS: &'static [&'static str] = &[
        "discord:deletes",
        "discord:updates",
        "discord:reports",
    ];

    // Helper to map and deserialize an incoming Redis payload into a LogEvent
    pub fn from_redis(channel: &mut String, payload: &str) -> Option<Self> {
        match channel.as_str() {
            "discord:deletes" => serde_json::from_str::<DeletedMessagePayload>(payload)
                .ok()
                .map(Self::MessageDelete),
            "discord:updates" => serde_json::from_str::<ModifiedMessagePayload>(payload)
                .ok()
                .map(Self::MessageEdit),
            "discord:reports" => serde_json::from_str::<ReportedMessagePayload>(payload)
                .ok()
                .map(Self::MessageReport), // <-- Added
            _ => None,
        }
    }

    // Helper to format a LogEvent variant into an axum SSE event representation
    pub fn to_sse_event(&self) -> Result<Event, axum::Error> {
        match self {
            LogEvent::MessageDelete(payload) => {
                Event::default().event("message-delete").json_data(payload)
            }
            LogEvent::MessageEdit(payload) => {
                Event::default().event("message-edit").json_data(payload)
            }
            LogEvent::MessageReport(payload) => {
                Event::default().event("message-report").json_data(payload) // <-- Added
            }
        }
    }

    pub fn guild_id(&self) -> Option<&str> {
        match self {
            LogEvent::MessageDelete(payload) => Some(&payload.guild_id),
            LogEvent::MessageEdit(payload) => Some(&payload.guild_id),
            LogEvent::MessageReport(payload) => Some(&payload.guild_id),
        }
    }
}

async fn health_check() -> &'static str {
    "OK"
}

#[derive(Deserialize)]
pub struct SseQuery {
    pub guild_id: String,
}

// Single endpoint multiplexing all SSE event variants
async fn sse_handler(
    State(state): State<Arc<WebState>>,
    Query(params): Query<SseQuery>,
) -> Sse<impl Stream<Item=Result<Event, Infallible>>> {
    let rx = state.tx.subscribe();
    let target_guild_id = params.guild_id;

    let stream = BroadcastStream::new(rx)
        .filter_map(|msg| msg.ok())
        // Keep only events belonging to the client's guild
        .filter(move |msg| {
            match msg.guild_id() {
                Some(g_id) => g_id == target_guild_id,
                None => false,
            }
        })
        .map(|msg| {
            let event = msg.to_sse_event()
                .unwrap_or_else(|_| Event::default().data("serialization error"));
            Ok(event)
        });

    Sse::new(stream).keep_alive(
        KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text("keep-alive"),
    )
}

pub async fn start_web_server(
    redis_client: redis::Client,
    tx: broadcast::Sender<LogEvent>,
) -> Result<(), Error> {
    let tx_clone = tx.clone();

    // Spawn Redis Pub/Sub subscriber task
    tokio::spawn(async move {
        loop {
            match redis_client.get_async_pubsub().await {
                Ok(mut pubsub) => {
                    if let Err(e) = pubsub.subscribe(LogEvent::REDIS_CHANNELS).await {
                        eprintln!("Failed to subscribe to Redis: {}", e);
                        tokio::time::sleep(Duration::from_secs(5)).await;
                        continue;
                    }
                    println!("Subscribed to Redis channels: {:?}", LogEvent::REDIS_CHANNELS);

                    let mut stream = pubsub.on_message();
                    while let Some(msg) = stream.next().await {
                        let mut channel = msg.get_channel_name().to_string();
                        if let Ok(payload_str) = msg.get_payload::<String>() {
                            if let Some(event) = LogEvent::from_redis(&mut channel, &payload_str) {
                                let _ = tx_clone.send(event);
                            }
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Redis PubSub connection failed: {}. Retrying in 5s...", e);
                    tokio::time::sleep(Duration::from_secs(5)).await;
                }
            }
        }
    });

    let cors = CorsLayer::new()
        .allow_origin("http://localhost:3000".parse::<HeaderValue>()?)
        .allow_methods([Method::GET]);

    let shared_state = Arc::new(WebState { tx });
    let app = Router::new()
        .route("/health", get(health_check))
        .route("/api/sse/events", get(sse_handler)) // Multiplexed SSE connection
        .layer(cors)
        .with_state(shared_state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    let listener = tokio::net::TcpListener::bind(addr).await?;

    println!("Starting web server on http://{}", addr);

    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            eprintln!("Web server error: {}", e);
        }
    });

    Ok(())
}