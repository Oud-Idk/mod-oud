//! Wire types and transport for dashboard music control commands.
//!
//! Commands flow over Redis pub/sub so the web server can run in a separate
//! process (or behind a load balancer across several bot instances):
//!
//! ```text
//! web instance ──publish──▶ music_web_commands ──▶ owning bot instance's actor
//!      ▲                                                        │
//!      └────────reply◀── music_web_replies:{instance} ◀─────────┘
//! ```
//!
//! Every bot instance receives every command but only the instance whose shard
//! owns the target guild answers; replies carry the originating request id back
//! to the publishing web instance's unique reply channel.

use crate::features::music::keys;
use fred::clients::{Client, SubscriberClient};
use fred::interfaces::{EventInterface, PubsubInterface};
use serde::{Deserialize, Serialize};
use serenity::model::id::{ChannelId, GuildId, UserId};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::oneshot;
use tracing::{debug, error, warn};
use uuid::Uuid;

/// How long the web server waits for an owning bot instance to answer.
const COMMAND_TIMEOUT_SECS: u64 = 30;

/// The action the dashboard wants the guild's music actor to perform.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "action",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum MusicAction {
    /// Start playing a track or the current queue.
    Play {
        /// The query from the web (`YouTube` search / Spotify URL / `YouTube` URL).
        query: String,
        /// Requested by user ID.
        requested_by_id: Option<UserId>,
    },
    /// Pause playback.
    Pause,
    /// Resume playback.
    Resume,
    /// Skip to the next track.
    Skip,
    /// Go back to the previous track.
    Prev,
    /// Restart the current track.
    Restart,
    /// Stop playback and leave the voice channel.
    Stop,
    /// Shuffle the queue.
    Shuffle,
    /// Clear the queue.
    ClearQueue,
    /// Report the currently playing track.
    NowPlaying,
    /// Seek to a position in the current track.
    Seek {
        /// The human readable time input.
        input: String,
    },
    /// Move the bot to a given voice channel.
    GoToChannel {
        /// The channel the bot should go to.
        channel_id: ChannelId,
    },
}

/// A dashboard command published on [`keys::commands_channel`].
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteMusicCommand {
    /// Unique id correlating the reply to this request.
    #[serde(rename = "requestId")]
    pub request_id: String,
    /// ID of the guild whose music should be controlled.
    pub guild_id: u64,
    /// Channel the owning bot instance must publish the result to.
    pub reply_to: String,
    /// The action to perform.
    #[serde(flatten)]
    pub action: MusicAction,
}

/// The outcome published back to the requester's reply channel.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteMusicResult {
    /// Echoes the originating request id.
    #[serde(rename = "requestId")]
    pub request_id: String,
    /// Whether the command succeeded.
    pub ok: bool,
    /// Success payload, present when `ok`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
    /// Human-readable error message, present when not `ok`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl RemoteMusicResult {
    /// Builds a successful result carrying `data`.
    #[must_use]
    pub const fn success(request_id: String, data: serde_json::Value) -> Self {
        Self {
            request_id,
            ok: true,
            data: Some(data),
            error: None,
        }
    }

    /// Builds a failed result carrying `error`.
    #[must_use]
    pub const fn failure(request_id: String, error: String) -> Self {
        Self {
            request_id,
            ok: false,
            data: None,
            error: Some(error),
        }
    }

    /// Converts the wire result back into the in-process outcome type.
    ///
    /// # Errors
    /// Returns the carried error message when `ok` is false.
    pub fn into_inner(self) -> Result<serde_json::Value, String> {
        if self.ok {
            Ok(self.data.unwrap_or(serde_json::Value::Null))
        } else {
            Err(self
                .error
                .unwrap_or_else(|| "Unknown music command failure".to_string()))
        }
    }
}

type PendingMap = Arc<Mutex<HashMap<String, oneshot::Sender<RemoteMusicResult>>>>;

/// Removes the pending entry on every exit path, including task cancellation
/// while waiting for the reply.
struct PendingGuard {
    pending: PendingMap,
    request_id: String,
}

impl Drop for PendingGuard {
    fn drop(&mut self) {
        if let Ok(mut pending) = self.pending.lock() {
            pending.remove(&self.request_id);
        }
    }
}

/// Sender-side handle shared with the web server. Publishes commands onto the
/// shared Redis command channel and awaits the correlated reply.
#[derive(Clone)]
pub struct WebCommandBus {
    redis: Client,
    pending: PendingMap,
    reply_channel: String,
}

impl WebCommandBus {
    /// Creates a new bus backed by Redis pub/sub, subscribing this process to
    /// its own unique reply channel.
    #[must_use]
    pub fn new(redis: Client, subscriber: SubscriberClient) -> Self {
        let instance_id = Uuid::new_v4();
        let reply_channel = keys::replies_channel(&instance_id.to_string());
        let pending: PendingMap = Arc::default();

        let handler_pending = Arc::clone(&pending);
        let handler_reply_channel = reply_channel.clone();
        subscriber.on_message(move |msg| {
            let pending = Arc::clone(&handler_pending);
            let reply_channel = handler_reply_channel.clone();

            async move {
                if msg.channel != reply_channel.as_str() {
                    return Ok(());
                }

                let payload = match msg.value.convert::<String>() {
                    Ok(val) => val,
                    Err(e) => {
                        warn!(error = ?e, "Failed to convert music command reply payload");
                        return Ok(());
                    }
                };

                let result: RemoteMusicResult = match serde_json::from_str(&payload) {
                    Ok(result) => result,
                    Err(e) => {
                        warn!(error = %e, payload = %payload, "Failed to parse music command reply");
                        return Ok(());
                    }
                };

                if let Ok(mut pending) = pending.lock()
                    && let Some(reply_tx) = pending.remove(&result.request_id)
                {
                    debug!(request_id = %result.request_id, "Matched music command reply");
                    let _ = reply_tx.send(result);
                } else {
                    debug!(request_id = %result.request_id, "Reply arrived for unknown or expired request");
                }

                Ok(())
            }
        });

        let subscriber_for_subscribe = subscriber;
        let subscribe_channel = reply_channel.clone();
        tokio::spawn(async move {
            match subscriber_for_subscribe
                .subscribe(subscribe_channel.as_str())
                .await
            {
                Ok(()) => debug!("Subscribed to music web reply channel"),
                Err(e) => error!(error = ?e, "Failed to subscribe to music web reply channel"),
            }
        });

        Self {
            redis,
            pending,
            reply_channel,
        }
    }

    /// Publishes a command to the owning bot instance and awaits its reply.
    ///
    /// # Errors
    /// Returns an error string if serialization/publishing fails, or if no bot
    /// instance answers within the command timeout.
    pub async fn send(
        &self,
        guild_id: GuildId,
        action: MusicAction,
    ) -> Result<serde_json::Value, String> {
        let request_id = Uuid::new_v4().to_string();

        let (reply_tx, reply_rx) = oneshot::channel();
        if let Ok(mut pending) = self.pending.lock() {
            pending.insert(request_id.clone(), reply_tx);
        }
        let _guard = PendingGuard {
            pending: Arc::clone(&self.pending),
            request_id: request_id.clone(),
        };

        let command = RemoteMusicCommand {
            request_id: request_id.clone(),
            guild_id: guild_id.get(),
            reply_to: self.reply_channel.clone(),
            action,
        };

        let payload = serde_json::to_string(&command)
            .map_err(|e| format!("Failed to serialize music command: {e}"))?;

        let published: Result<i64, _> = self.redis.publish(keys::commands_channel(), payload).await;
        if let Err(e) = published {
            return Err(format!("Failed to publish music command: {e}"));
        }

        match tokio::time::timeout(Duration::from_secs(COMMAND_TIMEOUT_SECS), reply_rx).await {
            Ok(Ok(result)) => {
                debug!(request_id = %request_id, "Music command completed");
                result.into_inner()
            }
            Ok(Err(_)) => Err("Music command reply channel closed".to_string()),
            Err(_) => Err("Command timed out".to_string()),
        }
    }
}

/// Wire-level message received from the dashboard.
#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ClientMessage {
    /// A music control command.
    Music {
        /// Client-provided ID used to correlate the acknowledgement.
        #[serde(rename = "requestId")]
        request_id: Option<String>,
        /// The action to perform.
        #[serde(flatten)]
        action: MusicAction,
    },
}

/// Wire-level acknowledgement sent back to the dashboard.
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ServerMessage {
    /// An acknowledgement of a music command.
    Ack {
        /// Echoes back the client's request ID, if any.
        #[serde(rename = "requestId", skip_serializing_if = "Option::is_none")]
        request_id: Option<String>,
        /// Whether the command succeeded.
        ok: bool,
        /// Human-readable error message on failure.
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
        /// Optional result payload on success.
        #[serde(skip_serializing_if = "Option::is_none")]
        data: Option<serde_json::Value>,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserializes_play_message() {
        let message: ClientMessage = serde_json::from_str(
            r#"{"type":"music","requestId":"abc","action":"play","query":"Never Gonna Give You Up","requestedById":"123"}"#,
        )
            .expect("should deserialize");

        match message {
            ClientMessage::Music { request_id, action } => {
                assert_eq!(request_id.as_deref(), Some("abc"));
                match action {
                    MusicAction::Play {
                        query,
                        requested_by_id,
                    } => {
                        assert_eq!(query, "Never Gonna Give You Up");
                        assert_eq!(requested_by_id, Some(UserId::from(123)));
                    }
                    _ => panic!("Expected MusicAction::Play variant"),
                }
            }
        }
    }

    #[test]
    fn deserializes_play_message_with_numeric_id() {
        let message: ClientMessage = serde_json::from_str(
            r#"{"type":"music","action":"play","query":"x","requestedById":123}"#,
        )
        .expect("should deserialize");

        match message {
            ClientMessage::Music {
                action:
                    MusicAction::Play {
                        requested_by_id, ..
                    },
                ..
            } => {
                assert_eq!(requested_by_id, Some(UserId::from(123)));
            }
            ClientMessage::Music { .. } => panic!("Expected MusicAction::Play variant"),
        }
    }

    #[test]
    fn deserializes_play_message_without_requested_by() {
        let message: ClientMessage =
            serde_json::from_str(r#"{"type":"music","action":"play","query":"x"}"#)
                .expect("should deserialize");

        match message {
            ClientMessage::Music {
                action:
                    MusicAction::Play {
                        requested_by_id, ..
                    },
                ..
            } => {
                assert_eq!(requested_by_id, None);
            }
            ClientMessage::Music { .. } => panic!("Expected MusicAction::Play variant"),
        }
    }

    #[test]
    fn deserializes_unit_actions() {
        let actions = [
            ("pause", MusicAction::Pause),
            ("resume", MusicAction::Resume),
            ("stop", MusicAction::Stop),
            ("skip", MusicAction::Skip),
            ("prev", MusicAction::Prev),
            ("restart", MusicAction::Restart),
            ("shuffle", MusicAction::Shuffle),
            ("clearQueue", MusicAction::ClearQueue),
            ("nowPlaying", MusicAction::NowPlaying),
        ];

        for (name, expected) in actions {
            // If testing via ClientMessage:
            let json = format!(r#"{{"type":"music","action":"{name}"}}"#);
            let msg: ClientMessage = serde_json::from_str(&json)
                .unwrap_or_else(|e| panic!("failed to deserialize {name}: {e}"));

            match msg {
                ClientMessage::Music { action, .. } => assert_eq!(action, expected),
            }
        }
    }

    #[test]
    fn serializes_ack_without_null_fields() {
        let ack = ServerMessage::Ack {
            request_id: Some("abc".into()),
            ok: true,
            error: None,
            data: Some(serde_json::json!({ "title": "Song" })),
        };
        let json = serde_json::to_string(&ack).expect("should serialize");
        assert!(json.contains("\"ok\":true"));
        assert!(!json.contains("\"error\""));
        assert!(!json.contains("null"));
    }

    #[test]
    fn remote_command_round_trips_through_json() {
        let command = RemoteMusicCommand {
            request_id: "req-1".to_string(),
            guild_id: 987_654_321,
            reply_to: "music_web_replies:abc".to_string(),
            action: MusicAction::Play {
                query: "test song".to_string(),
                requested_by_id: Some(UserId::from(42)),
            },
        };

        let json = serde_json::to_string(&command).expect("should serialize");
        assert!(json.contains("\"requestId\":\"req-1\""));
        assert!(json.contains("\"guildId\":987654321"));
        assert!(json.contains("\"replyTo\":\"music_web_replies:abc\""));
        assert!(json.contains("\"action\":\"play\""));

        let parsed: RemoteMusicCommand = serde_json::from_str(&json).expect("should deserialize");
        assert_eq!(parsed.request_id, "req-1");
        assert_eq!(parsed.guild_id, 987_654_321);
        assert_eq!(parsed.reply_to, "music_web_replies:abc");
        assert_eq!(
            parsed.action,
            MusicAction::Play {
                query: "test song".to_string(),
                requested_by_id: Some(UserId::from(42)),
            }
        );
    }

    #[test]
    fn remote_result_success_round_trips() {
        let result =
            RemoteMusicResult::success("req-2".to_string(), serde_json::json!({"title": "Song"}));
        let json = serde_json::to_string(&result).expect("should serialize");
        assert!(json.contains("\"ok\":true"));
        assert!(!json.contains("\"error\""));

        let parsed: RemoteMusicResult = serde_json::from_str(&json).expect("should deserialize");
        assert_eq!(
            parsed.into_inner(),
            Ok(serde_json::json!({"title": "Song"}))
        );
    }

    #[test]
    fn remote_result_failure_round_trips() {
        let result =
            RemoteMusicResult::failure("req-3".to_string(), "no voice channels".to_string());
        let json = serde_json::to_string(&result).expect("should serialize");
        assert!(json.contains("\"ok\":false"));

        let parsed: RemoteMusicResult = serde_json::from_str(&json).expect("should deserialize");
        assert_eq!(parsed.into_inner(), Err("no voice channels".to_string()));
    }
}
