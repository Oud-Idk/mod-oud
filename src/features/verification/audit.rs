//! Per-completion audit trail for verification: the verified role landing, and on whom. See
//! `docs/logging.md`.

use serenity::all::{GuildId, RoleId, UserId};
use tracing::info;

/// Records the verified role being granted.
pub fn role_granted(guild_id: GuildId, user_id: UserId, role_id: RoleId) {
    info!(
        event = "role_granted",
        %guild_id,
        %user_id,
        %role_id,
        "verification: granted the verified role"
    );
}
