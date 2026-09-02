//! Signed ticket verification for real-time endpoints (WS/SSE).
//!
//! Dashboard issues short-lived tickets: `HMAC-SHA256("{guild_id}:{user_id}:{expires}:{purpose}", INTERNAL_API_SECRET)`
//! Client sends `guild_id`, `user_id`, `expires`, `sig` as query params. Rust verifies without DB.
//! Ticket TTL is validated by the issuer (dashboard). Rust only checks expiry + HMAC.

use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;
use std::time::{SystemTime, UNIX_EPOCH};
use subtle::ConstantTimeEq;

/// Verifies a ticket's HMAC and expiry.
///
/// `purpose` must be `"ws"` for music WebSocket or `"sse"` for live-feed SSE.
/// Returns `true` only if signature matches AND `now <= expires`.
#[must_use]
pub fn verify_ticket(
    guild_id: &str,
    user_id: &str,
    expires: u64,
    sig: &str,
    purpose: &str,
    secret: &[u8],
) -> bool {
    // Check expiry first to avoid HMAC work on expired tickets.
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    if now > expires {
        return false;
    }

    if guild_id.is_empty() || user_id.is_empty() || sig.is_empty() || purpose.is_empty() {
        return false;
    }

    let payload = format!("{guild_id}:{user_id}:{expires}:{purpose}");

    let Ok(mut mac) = Hmac::<Sha256>::new_from_slice(secret) else {
        return false;
    };
    mac.update(payload.as_bytes());
    let expected = hex::encode(mac.finalize().into_bytes());

    let expected_bytes = hex::decode(&expected).unwrap_or_default();
    let sig_bytes = hex::decode(sig).unwrap_or_default();
    expected_bytes.ct_eq(&sig_bytes).into()
}

/// Generates a ticket signature for a given payload (used in tests / docs).
#[must_use]
pub fn sign_ticket(
    guild_id: &str,
    user_id: &str,
    expires: u64,
    purpose: &str,
    secret: &[u8],
) -> String {
    let payload = format!("{guild_id}:{user_id}:{expires}:{purpose}");
    let mut mac = Hmac::<Sha256>::new_from_slice(secret).expect("HMAC accepts any key length");
    mac.update(payload.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ticket_roundtrip_verifies() {
        let secret = b"test-secret-123";
        let sig = sign_ticket("1170276413056745482", "123456789", 9_999_999_999, "ws", secret);
        assert!(verify_ticket(
            "1170276413056745482",
            "123456789",
            9_999_999_999,
            &sig,
            "ws",
            secret
        ));
    }

    #[test]
    fn wrong_purpose_rejects() {
        let secret = b"test-secret-123";
        let sig = sign_ticket("1", "2", 9_999_999_999, "ws", secret);
        assert!(!verify_ticket("1", "2", 9_999_999_999, &sig, "sse", secret));
    }

    #[test]
    fn expired_rejects() {
        let secret = b"test-secret-123";
        let sig = sign_ticket("1", "2", 1, "ws", secret);
        assert!(!verify_ticket("1", "2", 1, &sig, "ws", secret));
    }

    #[test]
    fn tampered_guild_rejects() {
        let secret = b"test-secret-123";
        let sig = sign_ticket("1", "2", 9_999_999_999, "ws", secret);
        assert!(!verify_ticket("999", "2", 9_999_999_999, &sig, "ws", secret));
    }
}
