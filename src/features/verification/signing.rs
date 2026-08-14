use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;
use std::time::SystemTime;
use tracing::debug;

/// Verifies that an HMAC signature is valid and has not expired.
pub fn verify_sig(user_id: &str, guild_id: &str, expires: u64, sig: &str, secret_key: &[u8]) -> bool {
    // Check expiry
    let now = SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap().as_secs();
    if now > expires {
        debug!(user_id = user_id, "User link expired, skipping.");
        return false;
    }

    let payload = format!("{user_id}:{guild_id}:{expires}");

    // Calculate signature
    let mut mac: Hmac<Sha256> = Hmac::new_from_slice(secret_key).unwrap();
    mac.update(payload.as_bytes());
    let expected_res = mac.finalize();
    let expected_sig = hex::encode(expected_res.into_bytes());

    // Compare calculated signature with actual signature
    expected_sig == sig
}

/// Generates a signed, expiring verification link for a user and guild.
#[must_use]
pub fn generate_verification_link(user_id: u64, guild_id: u64, secret_key: &[u8], domain: &str) -> String {
    // Link expires in 10 minutes (600 seconds)
    let now = SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap().as_secs();
    let expires = now + 600;

    let payload = format!("{user_id}:{guild_id}:{expires}");

    // Sign the payload using secret
    let mut mac: Hmac<Sha256> = Hmac::new_from_slice(secret_key)
        .expect("HMAC can take key of any size");
    mac.update(payload.as_bytes());
    let result = mac.finalize();
    let signature = hex::encode(result.into_bytes());

    format!(
        "https://{domain}/verify/?user_id={user_id}&guild_id={guild_id}&expires={expires}&sig={signature}"
    )
}

