use serde::{Deserialize, Serialize};
use serde_with::serde_as;
use serenity::model::id::{ChannelId, GuildId, UserId};
use tokio::sync::mpsc::UnboundedSender;
use tokio::sync::oneshot;

/// Sender-side handle shared with the web server. Web handlers publish
/// [`WebCommand`]s here and wait for the per-command reply.
#[derive(Clone)]
pub struct WebCommandBus {
    tx: UnboundedSender<WebCommand>,
}

impl WebCommandBus {
    /// Creates a new bus backed by the given unbounded channel.
    #[must_use]
    pub const fn new(tx: UnboundedSender<WebCommand>) -> Self {
        Self { tx }
    }

    /// Publishes a command to the music actor, returning an error string if the
    /// actor has shut down.
    ///
    /// # Errors
    /// Returns an error string if the music actor has shut down and the channel
    /// is closed.
    pub fn send(&self, command: WebCommand) -> Result<(), String> {
        self.tx
            .send(command)
            .map_err(|e| format!("Web command bus is closed: {e}"))
    }
}

/// An in-process command targeting a single guild's music actor. The actor
/// executes it and replies through the embedded `oneshot` channel so the web
/// client can get an acknowledgement.
pub struct WebCommand {
    /// ID of the guild whose music actor should handle the command.
    pub guild_id: GuildId,
    /// The action to perform.
    pub action: MusicAction,
    /// Channel used to send the result back to the web client.
    pub reply: oneshot::Sender<Result<serde_json::Value, String>>,
}

/// The action the dashboard wants the guild's music actor to perform.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(
    tag = "action",
    rename_all = "kebab-case",
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

/// Wire-level message received from the dashboard.
#[serde_as]
#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
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
#[serde(tag = "type", rename_all = "kebab-case")]
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
            } => assert_eq!(requested_by_id, Some(UserId::from(123))),
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
            } => assert_eq!(requested_by_id, None),
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
            ("clear-queue", MusicAction::ClearQueue),
            ("now-playing", MusicAction::NowPlaying),
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
}
