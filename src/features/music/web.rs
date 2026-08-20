use crate::core::config::state::WebState;
use crate::features::music::actor::{GuildCommand, PlayPayload};
use crate::features::music::state::MusicState;
use crate::features::music::web_command::{ClientMessage, MusicAction, ServerMessage, WebCommand};
use axum::Router;
use axum::extract::ws::{Message, Utf8Bytes, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::response::Response;
use axum::routing::get;
use futures::stream::SplitSink;
use futures_util::{SinkExt, StreamExt};
use poise::serenity_prelude as serenity;
use serde::Deserialize;
use serde_with::{DisplayFromStr, serde_as};
use songbird::Songbird;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc::{Sender, UnboundedReceiver};
use tokio::sync::oneshot;
use tracing::{debug, error, instrument, warn};

#[serde_as]
#[derive(Deserialize, Debug)]
pub struct WsQuery {
    #[serde_as(as = "DisplayFromStr")]
    pub guild_id: u64,
}

/// Drains web control commands and forwards them to the target guild's music
/// actor. Runs in the bot process so it has direct access to the music actors,
/// songbird manager and Discord HTTP client.
pub fn start_music_web_control_worker(
    mut rx: UnboundedReceiver<WebCommand>,
    music_state: MusicState,
    manager: Arc<Songbird>,
    reqwest_client: reqwest::Client,
    http: Arc<serenity::Http>,
) {
    tokio::spawn(async move {
        while let Some(command) = rx.recv().await {
            let outcome = handle_music_command(
                &music_state,
                &manager,
                &reqwest_client,
                &http,
                command.guild_id,
                command.action,
            )
            .await;
            let _ = command.reply.send(outcome);
        }
    });
}

#[instrument(skip(music_state, manager, reqwest_client, http))]
async fn handle_music_command(
    music_state: &MusicState,
    manager: &Arc<Songbird>,
    reqwest_client: &reqwest::Client,
    http: &Arc<serenity::Http>,
    guild_id: serenity::GuildId,
    action: MusicAction,
) -> Result<serde_json::Value, String> {
    let actor_tx = music_state
        .get_or_spawn_actor(guild_id, Arc::clone(manager), reqwest_client.clone())
        .await;

    match action {
        MusicAction::Pause => {
            send_simple(&actor_tx, |respond| GuildCommand::Pause { respond }).await
        }
        MusicAction::Resume => {
            send_simple(&actor_tx, |respond| GuildCommand::Resume { respond }).await
        }
        MusicAction::Stop => send_simple(&actor_tx, |respond| GuildCommand::Stop { respond }).await,
        MusicAction::Skip => send_simple(&actor_tx, |respond| GuildCommand::Skip { respond }).await,
        MusicAction::Prev => {
            let vc_channel_id = resolve_voice_channel(http, guild_id).await?;
            send_simple(&actor_tx, move |respond| GuildCommand::Prev {
                vc_channel_id,
                respond,
            })
            .await
        }
        MusicAction::Restart => {
            send_simple(&actor_tx, |respond| GuildCommand::Restart { respond }).await
        }
        MusicAction::Shuffle => {
            send_simple(&actor_tx, |respond| GuildCommand::QueueShuffle { respond }).await
        }
        MusicAction::ClearQueue => {
            send_simple(&actor_tx, |respond| GuildCommand::QueueClear { respond }).await
        }
        MusicAction::NowPlaying => {
            send_simple(&actor_tx, |respond| GuildCommand::NowPlaying { respond }).await
        }
        MusicAction::GoToChannel { channel_id } => {
            send_simple(&actor_tx, |respond| GuildCommand::GoToChannel {
                vc_channel_id: channel_id,
                respond,
            })
            .await
        }
        MusicAction::Seek { input } => {
            send_simple(&actor_tx, |respond| GuildCommand::Seek { input, respond }).await
        }
        MusicAction::Play {
            query,
            requested_by_id,
        } => {
            let vc_channel_id = resolve_voice_channel(http, guild_id).await?;

            let (requested_by_name, requested_by_id) = match requested_by_id {
                Some(user_id) => {
                    let name = http
                        .get_user(user_id)
                        .await
                        .map_or_else(|_| "Web".to_string(), |user| user.name);
                    (name, user_id.get())
                }
                None => ("Web".to_string(), 0),
            };

            let (respond_tx, respond_rx) = oneshot::channel();
            actor_tx
                .send(GuildCommand::WebPlay(Box::new(PlayPayload {
                    query,
                    vc_channel_id,
                    requested_by_name,
                    requested_by_id,
                    respond: respond_tx,
                })))
                .await
                .map_err(|e| format!("Failed to send play command: {e}"))?;

            let outcome = respond_rx
                .await
                .map_err(|e| format!("Play command channel closed: {e}"))?
                .map_err(|e| e.to_string())?;

            let data = match outcome {
                crate::features::music::state::PlayOutcome::Single(info) => {
                    serde_json::json!({
                        "status": "playing",
                        "title": info.title,
                        "thumbnail": info.thumbnail
                    })
                }
                crate::features::music::state::PlayOutcome::Playlist { first_track, count } => {
                    serde_json::json!({
                        "status": "playing",
                        "title": first_track.title,
                        "thumbnail": first_track.thumbnail,
                        "playlistCount": count,
                    })
                }
            };
            Ok(data)
        }
    }
}

/// Dispatches a [`GuildCommand`] that carries a oneshot reply and serializes the
/// reply value for the web client.
async fn send_simple<T: serde::Serialize>(
    actor_tx: &Sender<GuildCommand>,
    build: impl FnOnce(oneshot::Sender<anyhow::Result<T>>) -> GuildCommand,
) -> Result<serde_json::Value, String> {
    let (respond_tx, respond_rx) = oneshot::channel();
    actor_tx
        .send(build(respond_tx))
        .await
        .map_err(|e| format!("Failed to send command to music actor: {e}"))?;
    match respond_rx.await {
        Ok(Ok(value)) => serde_json::to_value(value).map_err(|e| e.to_string()),
        Ok(Err(e)) => Err(e.to_string()),
        Err(e) => Err(format!("Music actor closed command channel: {e}")),
    }
}

/// Picks a voice channel to join when the bot isn't connected yet. If the bot is
/// already in a voice channel in this guild, the actor reuses the existing call.
async fn resolve_voice_channel(
    http: &Arc<serenity::Http>,
    guild_id: serenity::GuildId,
) -> Result<serenity::ChannelId, String> {
    let channels = http
        .get_channels(guild_id)
        .await
        .map_err(|e| format!("Failed to fetch server channels: {e}"))?;

    channels
        .iter()
        .find(|channel| channel.kind == serenity::ChannelType::Voice)
        .map(|channel| channel.id)
        .ok_or_else(|| "No voice channel found in this server. Create one first.".to_string())
}

#[instrument(skip(state))]
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<WebState>>,
    Query(params): Query<WsQuery>,
) -> Result<Response, axum::http::StatusCode> {
    debug!(
        guild_id = params.guild_id,
        "New WebSocket control connection"
    );
    Ok(ws.on_upgrade(move |socket| {
        handle_socket(socket, state, serenity::GuildId::from(params.guild_id))
    }))
}

async fn handle_socket(socket: WebSocket, state: Arc<WebState>, guild_id: serenity::GuildId) {
    let (mut sender, mut receiver) = socket.split();
    let mut events_rx = state.music_state.events_tx.subscribe();
    let mut ping_interval = tokio::time::interval(Duration::from_secs(20));

    loop {
        tokio::select! {
            // Incoming WebSocket message from client
            client_msg = receiver.next() => {
                match client_msg {
                    Some(Ok(Message::Text(text))) => {
                        // Pass sender or handle directly
                        handle_text_message(&state, &mut sender, guild_id, text.as_str()).await;
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    _ => {}
                }
            }

            // Heartbeat ping
            _ = ping_interval.tick() => {
                if sender.send(Message::Ping(axum::body::Bytes::from_static(b"ping"))).await.is_err() {
                    break;
                }
            }

            // Backend broadcast events
            event_result = events_rx.recv() => {
                match event_result {
                    Ok((event_guild_id, now_playing)) => {
                        if serenity::GuildId::from(event_guild_id) == guild_id {
                            let payload = serde_json::json!({
                                "type": "event",
                                "event": "nowPlaying",
                                "data": now_playing,
                            });
                            if let Ok(json) = serde_json::to_string(&payload)
                                && sender.send(Message::Text(Utf8Bytes::from(json)))
                                    .await.is_err() {
                                break;
                            }
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                        warn!("Dropped {n} events due to slow socket");
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                        break;
                    }
                }
            }
        }
    }
}

async fn handle_text_message(
    state: &WebState,
    sender: &mut SplitSink<WebSocket, Message>,
    guild_id: serenity::GuildId,
    text: &str,
) {
    let message: Result<ClientMessage, _> = serde_json::from_str(text);

    let (request_id, action) = match message {
        Ok(ClientMessage::Music { request_id, action }) => (request_id, action),
        Err(e) => {
            warn!(error = %e, "Failed to parse WebSocket control message");
            let ack = ServerMessage::Ack {
                request_id: None,
                ok: false,
                error: Some(format!("Invalid message: {e}")),
                data: None,
            };
            let _ = sender
                .send(Message::Text(Utf8Bytes::from(
                    serde_json::to_string(&ack).unwrap_or_default(),
                )))
                .await;
            return;
        }
    };

    let (reply_tx, reply_rx) = oneshot::channel();
    let command = WebCommand {
        guild_id,
        action,
        reply: reply_tx,
    };

    if let Err(e) = state.web_commands.send(command) {
        error!(error = %e, "Failed to enqueue WebSocket control command");
        let ack = ServerMessage::Ack {
            request_id,
            ok: false,
            error: Some(e),
            data: None,
        };
        let _ = sender
            .send(Message::Text(Utf8Bytes::from(
                serde_json::to_string(&ack).unwrap_or_default(),
            )))
            .await;
        return;
    }

    let reply = tokio::time::timeout(Duration::from_secs(30), reply_rx).await;

    let ack = match reply {
        Ok(Ok(Ok(data))) => ServerMessage::Ack {
            request_id,
            ok: true,
            error: None,
            data: Some(data),
        },
        Ok(Ok(Err(e))) => ServerMessage::Ack {
            request_id,
            ok: false,
            error: Some(e),
            data: None,
        },
        Ok(Err(_)) => ServerMessage::Ack {
            request_id,
            ok: false,
            error: Some("Music actor closed the command channel".into()),
            data: None,
        },
        Err(_) => ServerMessage::Ack {
            request_id,
            ok: false,
            error: Some("Command timed out".into()),
            data: None,
        },
    };

    let Ok(json) = serde_json::to_string(&ack) else {
        return;
    };
    let _ = sender.send(Message::Text(Utf8Bytes::from(json))).await;
}

/// Registers the music web route for the WebSocket control connection.
pub fn routes() -> Router<Arc<WebState>> {
    Router::new().route("/ws/control", get(ws_handler))
}
