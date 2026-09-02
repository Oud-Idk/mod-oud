use crate::core::config::state::WebState;
use crate::features::music::actor::{GuildCommand, PlayPayload};
use crate::features::music::keys;
use crate::features::music::state::MusicState;
use crate::features::music::web_command::{
    ClientMessage, MusicAction, RemoteMusicCommand, RemoteMusicResult, ServerMessage,
};
use axum::Router;
use axum::extract::ws::{Message, Utf8Bytes, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::response::Response;
use axum::routing::get;
use fred::clients::{Client, SubscriberClient};
use fred::interfaces::{EventInterface, PubsubInterface};
use futures::stream::SplitSink;
use futures_util::{SinkExt, StreamExt};
use poise::serenity_prelude as serenity;
use serde::Deserialize;
use serde_with::{DisplayFromStr, serde_as};
use songbird::Songbird;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc::Sender;
use tokio::sync::oneshot;
use tracing::{debug, error, instrument, warn};

#[serde_as]
#[derive(Deserialize, Debug)]
pub struct WsQuery {
    #[serde_as(as = "DisplayFromStr")]
    pub guild_id: u64,
    /// Discord user ID of the ticket owner.
    #[serde(default)]
    pub user_id: Option<String>,
    /// Unix expiry seconds.
    #[serde_as(as = "Option<DisplayFromStr>")]
    #[serde(default)]
    pub expires: Option<u64>,
    /// HMAC-SHA256 hex signature over "`{guild_id}`:`{user_id}`:`{expires}`:`ws`".
    #[serde(default)]
    pub sig: Option<String>,
}

/// Dependencies for the Redis-backed music web control worker.
pub struct MusicWebControlParams {
    /// Redis client used to publish command results.
    pub redis_client: Client,
    /// Shared state manager holding the guild music actors.
    pub music_state: MusicState,
    /// Songbird voice manager.
    pub manager: Arc<Songbird>,
    /// Shared HTTP client for external requests.
    pub reqwest_client: reqwest::Client,
    /// Serenity HTTP client for Discord API calls.
    pub http: Arc<serenity::Http>,
    /// This process's shard index (`SHARD_INDEX`).
    pub shard_index: u32,
    /// Total number of shards in the bot's sharding plan (`TOTAL_SHARDS`).
    pub total_shards: u32,
}

/// Listens on the shared Redis commands channel and executes dashboard music
/// commands against this instance's music actors.
///
/// Every bot instance receives every command; only the instance whose shard
/// owns the target guild answers. Runs in the bot process so it has direct
/// access to the music actors, songbird manager and Discord HTTP client.
pub fn start_music_web_control_worker(
    subscriber_client: SubscriberClient,
    params: MusicWebControlParams,
) {
    let params = Arc::new(params);

    subscriber_client.on_message(move |msg| {
        let params = Arc::clone(&params);

        async move {
            if msg.channel != keys::commands_channel() {
                return Ok(());
            }

            let payload = match msg.value.convert::<String>() {
                Ok(val) => val,
                Err(e) => {
                    warn!(error = ?e, "Failed to convert music web command payload");
                    return Ok(());
                }
            };

            let command: RemoteMusicCommand = match serde_json::from_str(&payload) {
                Ok(command) => command,
                Err(e) => {
                    warn!(error = %e, payload = %payload, "Failed to parse music web command");
                    return Ok(());
                }
            };

            let guild_id = serenity::GuildId::new(command.guild_id);
            if !owns_guild(guild_id, params.shard_index, params.total_shards) {
                debug!(%guild_id, "Music command for a guild on another shard; ignoring");
                return Ok(());
            }

            debug!(%guild_id, request_id = %command.request_id, "Executing dashboard music command");

            let outcome = handle_music_command(
                &params.music_state,
                &params.manager,
                &params.reqwest_client,
                &params.http,
                guild_id,
                command.action,
            )
                .await;

            let result = match outcome {
                Ok(data) => RemoteMusicResult::success(command.request_id.clone(), data),
                Err(e) => RemoteMusicResult::failure(command.request_id.clone(), e),
            };

            let reply = match serde_json::to_string(&result) {
                Ok(reply) => reply,
                Err(e) => {
                    error!(error = %e, "Failed to serialize music command result");
                    return Ok(());
                }
            };

            let published: Result<i64, _> = params
                .redis_client
                .publish(command.reply_to.as_str(), reply)
                .await;
            if let Err(e) = published {
                warn!(
                    request_id = %result.request_id,
                    error = ?e,
                    "Failed to publish music command result"
                );
            }

            Ok(())
        }
    });

    tokio::spawn(async move {
        match subscriber_client.subscribe(keys::commands_channel()).await {
            Ok(()) => debug!("Subscribed to music web commands channel"),
            Err(e) => error!(error = ?e, "Failed to subscribe to music web commands"),
        }
    });
}

/// Returns true when Discord routes `guild_id`'s gateway events to this
/// process's shard. Discord assigns a guild to shard
/// `(guild_id >> 22) % total_shards`, so ownership is deterministic and needs
/// no shared registry.
fn owns_guild(guild_id: serenity::GuildId, shard_index: u32, total_shards: u32) -> bool {
    if total_shards == 0 {
        return false;
    }
    ((guild_id.get() >> 22) % u64::from(total_shards)) == u64::from(shard_index)
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
    // Ticket verification for WS (signed ticket system).
    let Some(secret) = state.core.config.internal_api_secret.as_deref() else {
        warn!("INTERNAL_API_SECRET not set");
        return Err(axum::http::StatusCode::INTERNAL_SERVER_ERROR);
    };
    let (Some(user_id), Some(expires), Some(sig)) =
        (params.user_id.as_deref(), params.expires, params.sig.as_deref())
    else {
        warn!(guild_id = params.guild_id, "Missing ticket for WS");
        return Err(axum::http::StatusCode::UNAUTHORIZED);
    };
    if !crate::web::ticket::verify_ticket(
        &params.guild_id.to_string(),
        user_id,
        expires,
        sig,
        "ws",
        secret.as_bytes(),
    ) {
        let expected = crate::web::ticket::sign_ticket(
            &params.guild_id.to_string(),
            user_id,
            expires,
            "ws",
            secret.as_bytes(),
        );
        warn!(
            guild_id = params.guild_id,
            user_id = %user_id,
            expires = expires,
            expected = %expected,
            "Invalid WS ticket. Sig mismatch (check INTERNAL_API_SECRET sync & purpose)"
        );
        return Err(axum::http::StatusCode::UNAUTHORIZED);
    }

    debug!(
        guild_id = params.guild_id,
        user_id = %user_id,
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

    let outcome = state.web_commands.send(guild_id, action).await;

    let ack = match outcome {
        Ok(data) => ServerMessage::Ack {
            request_id,
            ok: true,
            error: None,
            data: Some(data),
        },
        Err(e) => ServerMessage::Ack {
            request_id,
            ok: false,
            error: Some(e),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn guild_routes_to_its_own_shard() {
        // Single shard: everything is ours.
        assert!(owns_guild(serenity::GuildId::new(1), 0, 1));
        assert!(owns_guild(serenity::GuildId::new(u64::MAX), 0, 1));

        // Two shards: guild's top bits decide the owner.
        let shard_one_guild: u64 = (1 << 22) + 12_345;
        let shard_two_guild: u64 = 2 << 22;
        assert!(owns_guild(serenity::GuildId::new(shard_one_guild), 1, 2));
        assert!(!owns_guild(serenity::GuildId::new(shard_one_guild), 0, 2));
        assert!(owns_guild(serenity::GuildId::new(shard_two_guild), 0, 2));
        assert!(!owns_guild(serenity::GuildId::new(shard_two_guild), 1, 2));
    }

    #[test]
    fn zero_total_shards_never_owns() {
        assert!(!owns_guild(serenity::GuildId::new(1), 0, 0));
    }
}
