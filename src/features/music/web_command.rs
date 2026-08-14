use serde::{Deserialize, Serialize};
use serde_with::{DisplayFromStr, PickFirst, serde_as};
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
    pub fn send(&self, command: WebCommand) -> Result<(), String> {
        self.tx.send(command).map_err(|e| format!("Web command bus is closed: {e}"))
    }
}

/// An in-process command targeting a single guild's music actor. The actor
/// executes it and replies through the embedded `oneshot` channel so the web
/// client can get an acknowledgement.
pub struct WebCommand {
    /// ID of the guild whose music actor should handle the command.
    pub guild_id: u64,
    /// The action to perform.
    pub action: MusicAction,
    /// Optional search query / URL / seek position.
    pub query: Option<String>,
    /// ID of the dashboard user who requested the action.
    pub requested_by_id: Option<u64>,
    /// Channel used to send the result back to the web client.
    pub reply: oneshot::Sender<Result<serde_json::Value, String>>,
}

/// The action the dashboard wants the guild's music actor to perform.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum MusicAction {
    /// Start playing a track or the current queue.
    Play,
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
    #[serde(rename = "clearQueue")]
    ClearQueue,
    /// Report the currently playing track.
    #[serde(rename = "nowPlaying")]
    NowPlaying,
    /// Seek to a position in the current track.
    Seek,
    /// Move the bot to a given voice channel.
    #[serde(rename = "goToChannel")]
    GoToChannel,
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
        action: MusicAction,
        /// Optional search query / URL / seek position.
        #[serde(default)]
        query: Option<String>,
        /// ID of the dashboard user who requested the action.
        #[serde(rename = "requestedById", default)]
        #[serde_as(as = "Option<PickFirst<(DisplayFromStr, _)>>")]
        requested_by_id: Option<u64>,
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
            ClientMessage::Music { request_id, action, query, requested_by_id } => {
                assert_eq!(request_id.as_deref(), Some("abc"));
                assert_eq!(action, MusicAction::Play);
                assert_eq!(query.as_deref(), Some("Never Gonna Give You Up"));
                assert_eq!(requested_by_id, Some(123));
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
            ClientMessage::Music { requested_by_id, .. } => assert_eq!(requested_by_id, Some(123)),
        }
    }

    #[test]
    fn deserializes_play_message_without_requested_by() {
        let message: ClientMessage = serde_json::from_str(
            r#"{"type":"music","action":"play","query":"x"}"#,
        )
            .expect("should deserialize");
        match message {
            ClientMessage::Music { requested_by_id, .. } => assert_eq!(requested_by_id, None),
        }
    }

    #[test]
    fn deserializes_unit_actions() {
        for (name, payload, expected) in [
            ("pause", r#"{"type":"music","action":"pause"}"#, MusicAction::Pause),
            ("resume", r#"{"type":"music","requestId":"x","action":"resume"}"#, MusicAction::Resume),
            ("skip", r#"{"type":"music","action":"skip"}"#, MusicAction::Skip),
            ("stop", r#"{"type":"music","action":"stop"}"#, MusicAction::Stop),
            ("shuffle", r#"{"type":"music","action":"shuffle"}"#, MusicAction::Shuffle),
            ("clearQueue", r#"{"type":"music","action":"clearQueue"}"#, MusicAction::ClearQueue),
        ] {
            let message: ClientMessage = serde_json::from_str(payload)
                .unwrap_or_else(|e| panic!("failed to deserialize {name}: {e}"));
            match message {
                ClientMessage::Music { action, .. } => assert_eq!(action, expected, "{name} mismatch"),
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
