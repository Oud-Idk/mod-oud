use std::borrow::Cow;
use std::str::FromStr;
use serenity::all::Message;
use crate::features::automod::{FilterVerdict, MessageFilteringConfig};
use crate::features::automod::rules::check_rule;
use std::sync::LazyLock;
use regex::Regex;
use alloy_primitives::Address as EthAddress;
use base64::Engine;
use bitcoin::{bech32, Address as BtcAddress, TestnetVersion};
use bitcoin::Network;
use tracing::debug;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::engine::general_purpose::STANDARD_NO_PAD;

static ETH_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\b0x[a-fA-F0-9]{40}\b").expect("Invalid ETH Regex")
});

static BTC_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b").expect("Invalid BTC Regex")
});

static SEGWIT_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\bbc1[a-zA-Z0-9]{39,59}\b").expect("Invalid SegWit Regex")
});

static SOL_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\b[1-9A-HJ-NP-Za-km-z]{32,44}\b").expect("Invalid SOL Regex")
});

static COSMOS_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\bcosmos1[a-z0-9]{38}\b").expect("Invalid Cosmos Regex")
});

static TRON_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\bT[1-9A-HJ-NP-Za-km-z]{33}\b").expect("Invalid TRON Regex")
});

static APT_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\b0x[a-fA-F0-9]{64}\b").expect("Invalid APT Regex")
});

static TON_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\b(EQ|UQ|kQ|0Q)[a-zA-Z0-9_-]{46}\b").expect("Invalid TON Regex")
});

pub fn filter_crypto_addresses<'a>(
    message: &Message,
    filtering: &'a MessageFilteringConfig,
) -> FilterVerdict<'a> {
    let Some(crypto_address) = check_rule(filtering.crypto_address.as_ref(), message) else {
        return FilterVerdict::Pass;
    };

    let Some(addr) = scan_for_crypto(message.content.as_str()) else {
        return FilterVerdict::Pass;
    };

    debug!("Message flagged by Crypto Address filter");

    FilterVerdict::Block {
        rule_name: "Crypto Address".into(),
        base_rule: Cow::Borrowed(crypto_address),
        trigger_content: Some(Cow::Owned(addr)),
        custom_dm_message: None,
    }
}

fn is_valid_eth_address(candidate: &str) -> bool {
    let Ok(address) = EthAddress::from_str(candidate) else {
        return false;
    };

    let is_all_lower = candidate.chars().all(|c| !c.is_ascii_uppercase());
    let is_all_upper = candidate.chars().all(|c| !c.is_ascii_lowercase());

    if is_all_lower || is_all_upper {
        true
    } else {
        address.to_checksum(None) == candidate
    }
}

fn is_valid_btc_address(candidate: &str) -> bool {
    let Ok(address) = BtcAddress::from_str(candidate) else {
        return false;
    };

    address.is_valid_for_network(Network::Bitcoin)
        || address.is_valid_for_network(Network::Signet)
        || address.is_valid_for_network(Network::Regtest)
        || address.is_valid_for_network(Network::Testnet(TestnetVersion::V3))
        || address.is_valid_for_network(Network::Testnet(TestnetVersion::V4))
}

fn is_valid_sol_address(candidate: &str) -> bool {
    let Ok(decoded) = bs58::decode(candidate).into_vec() else {
        return false;
    };

    if decoded.len() == 32 {
        return true;
    }
    false
}

fn is_valid_tron_address(candidate: &str) -> bool {
    let Ok(decoded) = bs58::decode(candidate).into_vec() else {
        return false
    };

    if decoded.len() == 25 && decoded[0] == 0x41 {
        return true;
    }

    false
}

fn is_valid_cosmos_address(candidate: &str) -> bool {
    match bech32::decode(candidate) {
        Ok((hrp, _data)) => hrp.as_str() == "cosmos",
        Err(_) => false,
    }
}

fn is_valid_apt_address(candidate: &str) -> bool {
    let hex_part = &candidate[2..]; // Strip "0x"

    // Check if hex decoding succeeds and produces exactly 32 bytes
    if let Ok(bytes) = hex::decode(hex_part) {
        return bytes.len() == 32;
    }

    false
}

fn is_valid_ton_address(candidate: &str) -> bool {
    if candidate.len() != 48 {
        return false;
    }

    // Try decoding as URL-safe base64 (or standard base64)
    let decoded = URL_SAFE_NO_PAD.decode(candidate)
        .or_else(|_| STANDARD_NO_PAD.decode(candidate));

    if let Ok(bytes) = decoded {
        // User-friendly TON addresses always decode to 36 bytes!
        return bytes.len() == 36;
    }

    false
}

fn scan_for_crypto(text: &str) -> Option<String> {
    for mat in ETH_REGEX.find_iter(text) {
        let candidate = mat.as_str();
        if is_valid_eth_address(candidate) { return Some(candidate.to_string()); };
    }

    for mat in BTC_REGEX.find_iter(text).chain(SEGWIT_REGEX.find_iter(text)) {
        let candidate = mat.as_str();
        if is_valid_btc_address(candidate) { return Some(candidate.to_string()); };
    }

    for mat in SOL_REGEX.find_iter(text) {
        let candidate = mat.as_str();
        if is_valid_sol_address(candidate) { return Some(candidate.to_string()); };
    }

    for mat in COSMOS_REGEX.find_iter(text) {
        let candidate = mat.as_str();
        if is_valid_cosmos_address(candidate) { return Some(candidate.to_string()); };
    }

    for mat in TRON_REGEX.find_iter(text) {
        let candidate = mat.as_str();
        if is_valid_tron_address(candidate) { return Some(candidate.to_string()); };
    }

    for mat in APT_REGEX.find_iter(text) {
        let candidate = mat.as_str();
        if is_valid_apt_address(candidate) { return Some(candidate.to_string()); };
    }

    for mat in TON_REGEX.find_iter(text) {
        let candidate = mat.as_str();
        if is_valid_ton_address(candidate) { return Some(candidate.to_string()); };
    }

    None
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    use crate::features::automod::types::CryptoAddressRule;
    use super::*;

    fn mock_message(content: &str) -> Message {
        serde_json::from_value(json!({
            "id": "100000000000000000",
            "channel_id": "100000000000000000",
            "author": {
                "id": "100000000000000000",
                "username": "test_user",
                "discriminator": "0000",
                "avatar": null,
                "bot": false
            },
            "content": content,
            "timestamp": "2026-01-01T00:00:00.000000+00:00",
            "edited_timestamp": null,
            "tts": false,
            "mention_everyone": false,
            "mentions": [],
            "mention_roles": [],
            "attachments": [],
            "embeds": [],
            "reactions": [],
            "pinned": false,
            "type": 0
        })).expect("failed to construct mock Message")
    }


    // For the love that is holy, please do not send crypto addresses here :3
    // ETH
    #[test]
    fn eth_wrong_length_does_not_match() {
        assert!(scan_for_crypto("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA9604").is_none()); // 39 hex chars
    }

    #[test]
    fn eth_non_hex_does_not_match() {
        assert!(scan_for_crypto("0xOwOOwOOwOOwOOwOOwOOwOOwOOwOOwOOwOOwOOwOO").is_none());
    }

    #[test]
    fn eth_valid_checksum_passes() {
        let lower = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045";
        let addr = EthAddress::from_str(lower).unwrap();
        let checksummed = addr.to_checksum(None);

        assert!(is_valid_eth_address(&checksummed));
    }

    #[test]
    fn eth_invalid_checksum_fails() {
        let lower = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045";
        let addr = EthAddress::from_str(lower).unwrap();
        let mut checksummed = addr.to_checksum(None);

        // Flip the case of one alphabetic hex character to break the checksum
        // while keeping it mixed-case (so it doesn't fall into the all-lower/all-upper bypass)
        let idx = checksummed
            .char_indices()
            .find(|(_, c)| c.is_ascii_alphabetic())
            .map(|(i, _)| i)
            .unwrap();
        let bad_char = checksummed.as_bytes()[idx] as char;
        let flipped = if bad_char.is_ascii_uppercase() {
            bad_char.to_ascii_lowercase()
        } else {
            bad_char.to_ascii_uppercase()
        };
        checksummed.replace_range(idx..idx + 1, &flipped.to_string());

        assert!(!is_valid_eth_address(&checksummed));
    }

    // BTC
    #[test]
    fn btc_segwit_bech32_mainnet_address() {
        assert!(scan_for_crypto("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4").is_some());
    }

    #[test]
    fn btc_legacy_mainnet_address_is_valid() {
        assert!(scan_for_crypto("12VSGQQCRhw5Bah8qRkCBZFvWZsB15bDh7").is_some());
    }

    #[test]
    fn btc_garbage_base58_does_not_match() {
        assert!(scan_for_crypto("1InvalidAddressThatIsNotReal000000").is_none());
    }

    // SOL
    #[test]
    fn sol_wrong_decoded_length_does_not_match() {
        // Valid base58 but decodes to something other than 32 bytes
        assert!(scan_for_crypto("2NEpo7TZRRrLZSi2U").is_none());
    }

    // COSMOS
    #[test]
    fn cosmos_bad_checksum_does_not_match() {
        // Same as above but last char tampered to break the bech32 checksum
        assert!(scan_for_crypto("cosmos1qypqxpq9qcrsszgse4wwrq4vjtvenxsyj3xqzz").is_none());
    }

    // TRON
    #[test]
    fn tron_valid_mainnet_address() {
        assert!(scan_for_crypto("TK6PNSmbTEVrtrYTeheiWnpiuPjh59dMDb").is_some());
    }

    #[test]
    fn tron_wrong_version_byte_is_invalid() {
        // Same base58check structure, but version byte 0x00 instead of 0x41
        assert!(!is_valid_tron_address("1A8BNPPsJWNujgUq4Rzzze8azbzNtexJ6R"));
    }

    // APT
    #[test]
    fn apt_valid_32_byte_address() {
        assert!(scan_for_crypto("0x8a453ff17b8fdce89ea6b58427bc76074b7387630056c9ff7ce094068703496b").is_some());
    }

    #[test]
    fn apt_non_hex_char_does_not_match_regex() {
        assert!(scan_for_crypto("0xg0a724b66be28810e819e2871af9f24d722060b523e5d6fd242c2839e2540e56").is_none());
    }

    // TON
    #[test]
    fn ton_valid_48_char_address() {
        assert!(scan_for_crypto("UQV1_B__J650zyyJRT90WaRKJSkPS99kXJChdmSOwIE-bZPJ").is_some());
    }

    #[test]
    fn ton_wrong_length_is_invalid() {
        // 47 chars, fails the len(candidate) != 48 check immediately
        assert!(!is_valid_ton_address("cZP1INQimzXb2JAYylhVS2sP-2W1rv_ZOcvLtRqXIE1g_zM"));
    }

    #[test]
    fn ton_invalid_base64_char_is_invalid() {
        // 48 chars but contains '!', which isn't valid in url-safe or standard base64
        assert!(!is_valid_ton_address("qBHM1ZM-ON!lH3ED_ltnNuBcUjFm-gWzlY7gNFIFtkdTb4Y1"));
    }

    // Invalid
    #[test]
    fn plain_text_has_no_matches() {
        assert!(scan_for_crypto("hey, how's it going today?").is_none());
    }

    #[test]
    fn empty_string_has_no_matches() {
        assert!(scan_for_crypto("").is_none());
    }

    // Test individually
    #[test]
    fn is_valid_sol_address_rejects_short_string() {
        assert!(!is_valid_sol_address("abc"));
    }

    #[test]
    fn is_valid_cosmos_address_rejects_wrong_hrp() {
        // Valid bech32 checksum but wrong prefix (e.g. a bitcoin-style bech32 string)
        assert!(!is_valid_cosmos_address("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"));
    }

    #[test]
    fn test_batch_valid_crypto_addresses() {
        let valid_addresses = [
            "0x386d7fa2e861aa8f505c19e00298d3a9a24abe3c", // ETH / BNB / literally everything else
            "TGmUsMYB1oizxEoMbfPe2ZrZxfoHuadEUM", // TRON
            "0xa6bb3e59f9826c3da28d700429acc5e5172ebf45c280c0f93b29bd40d96ca42a", // APT
            "CSAE3BmW3sju1Zu6ykfRZT97PEGU54VoyeY3r4ZDoGoP", // SOL
            "UQDoFvHnw4x9R-aBx0d3oZNT8zHW-5NEDlLEIMEENTx0sOJ6", // TON
            "12VSGQQCRhw5Bah8qRkCBZFvWZsB15bDh7", // Old BTC
        ];

        for addr in valid_addresses {
            assert!(
                scan_for_crypto(addr).is_some(),
                "Expected to detect valid address, but missed: '{}'",
                addr
            );
        }
    }

    #[test]
    fn filter_crypto_addresses_blocks_message_with_valid_address() {
        let msg = mock_message("send funds to 0x386d7fa2e861aa8f505c19e00298d3a9a24abe3c");

        let filtering = MessageFilteringConfig {
            crypto_address: Some(CryptoAddressRule {
                enabled: true,
                action: vec![],
                timeout_duration_seconds: None,
                scope: Default::default(),
            }),
            ..Default::default()
        };

        match filter_crypto_addresses(&msg, &filtering) {
            FilterVerdict::Block { rule_name, trigger_content, .. } => {
                assert_eq!(rule_name, "Crypto Address");
                assert_eq!(trigger_content.as_deref(), Some("0x386d7fa2e861aa8f505c19e00298d3a9a24abe3c"));
            }
            other => panic!("expected Block verdict, got {:?}", other),
        }
    }

    #[test]
    fn filter_crypto_addresses_passes_when_rule_disabled() {
        let msg = mock_message("send funds to 0x386d7fa2e861aa8f505c19e00298d3a9a24abe3c");

        let filtering = MessageFilteringConfig {
            crypto_address: None,
            ..Default::default()
        };

        assert!(matches!(filter_crypto_addresses(&msg, &filtering), FilterVerdict::Pass));
    }
}