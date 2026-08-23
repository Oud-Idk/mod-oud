/// Redis channel every bot instance subscribes to for dashboard music commands.
pub const fn commands_channel() -> &'static str {
    "music_web_commands"
}

/// Per-instance Redis channel a web process listens on for command results.
pub fn replies_channel(instance_id: &str) -> String {
    format!("music_web_replies:{instance_id}")
}

/// Redis channel music actors publish now-playing updates to; every process
/// forwards these into its local broadcast channel for WebSocket clients.
pub const fn events_channel() -> &'static str {
    "music_web_events"
}
