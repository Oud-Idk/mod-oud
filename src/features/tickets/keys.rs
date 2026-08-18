use serenity::all::ChannelId;

/// Redis hash key storing a ticket's activity state.
pub fn ticket_key(channel_id: ChannelId) -> String {
    format!("ticket:{}", channel_id.get())
}

/// Redis set key tracking all currently active ticket channels.
pub fn active_tickets_key() -> &'static str {
    "active_tickets"
}

/// Redis pub/sub channel broadcasting ticket open/close events.
pub fn ticket_updates_channel() -> &'static str {
    "ticket_updates"
}

/// Redis lock key coordinating the ticket inactivity worker.
pub fn ticket_inactivity_lock_key() -> &'static str {
    "lock:ticket_inactivity_worker"
}