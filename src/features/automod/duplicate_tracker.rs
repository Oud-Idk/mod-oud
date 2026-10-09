use crate::features::automod::cache;
use crate::features::automod::keys;
use crate::features::automod::types::CrossChannelSpamRule;
use anyhow::Result;
use fred::clients::Client;
use regex::Regex;
use serenity::model::id::{ChannelId, GuildId, MessageId, UserId};
use std::collections::HashSet;
use std::sync::LazyLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tracing::debug;

/// A matched message recorded in the duplicate window.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DuplicateHit {
    /// The channel the matching copy was posted in.
    pub channel_id: ChannelId,
    /// The matching message, so it can be deleted later.
    pub message_id: MessageId,
    /// The window member verbatim, needed to remove it after a purge.
    member: String,
}

/// The outcome of recording one message against the duplicate window.
#[derive(Debug, Clone)]
pub enum DuplicateVerdict {
    /// The message was too short, or matched nothing above the threshold.
    Pass,
    /// The same text reached enough distinct channels to trip the rule.
    Trip {
        /// The matched copies, including the message being evaluated.
        hits: Vec<DuplicateHit>,
    },
}

/// Upper bound on the window entries compared per message.
///
/// The similarity loop is O(entries x message length), so a flood would
/// otherwise make every message expensive to check. A copy older than the
/// 50 most recent is not found, which does not matter when the bar is 3 channels.
const MAX_WINDOW_ENTRIES: u32 = 50;

/// Normalized text is truncated here to bound the Redis footprint at
/// 512 chars per entry rather than Discord's 2000 char limit.
///
/// Cost: two messages that differ only past this point compare as identical.
/// In practice the discriminating content of a spam message sits early.
const MAX_NORMALIZED_CHARS: usize = 512;

static URL_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"https?://\S+").expect("Invalid RegEx for URLs"));

static MENTION_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"<@[!&]?\d+>").expect("Invalid RegEx for Mentions"));

static CUSTOM_EMOJI_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"<a?:[a-zA-Z0-9_]+:\d+>").expect("Invalid RegEx for Emojis"));

/// Lowers, strips invisible characters, replaces URLs, mentions and emoji with
/// tokens, strips markdown, collapses whitespace, then truncates.
///
/// Order is load-bearing. The replacements run before the markdown strip because
/// their tokens use `<>`, which markdown would otherwise eat. Invisible controls
/// are removed before the replacements so a zero-width character inside an invite
/// URL cannot hide the link from the URL pattern.
///
/// The tokens matter more than they look: `discord.gg/aaa` and `discord.gg/bbb`
/// are barely similar as raw text but collapse to the same string here, which is
/// what catches an invite rotated between channels.
#[must_use]
pub fn normalize(content: &str) -> String {
    let lowered: String = content
        .chars()
        .filter(|c| !is_invisible(*c))
        .flat_map(char::to_lowercase)
        .collect();

    let tokenized = URL_REGEX.replace_all(&lowered, "<url>");
    let tokenized = MENTION_REGEX.replace_all(&tokenized, "<mention>");
    let tokenized = CUSTOM_EMOJI_REGEX.replace_all(&tokenized, "<emoji>");

    let cleaned: String = tokenized.chars().filter(|c| !is_markdown(*c)).collect();

    let mut normalized = String::with_capacity(cleaned.len());
    let mut last_was_space = false;
    for c in cleaned.chars() {
        if c.is_whitespace() {
            if !last_was_space {
                normalized.push(' ');
            }
            last_was_space = true;
        } else {
            normalized.push(c);
            last_was_space = false;
        }
    }

    normalized
        .trim()
        .chars()
        .take(MAX_NORMALIZED_CHARS)
        .collect()
}

/// Zero-width joiners, soft hyphens, variation selectors and bidi controls.
///
/// A spammer interleaves these to defeat exact-match filters, so stripping them
/// is what makes the near-duplicate comparison hold up.
///
/// Whitespace is exempt: a newline between two words carries the word boundary,
/// and dropping it before the collapse pass would fuse them into one token.
const fn is_invisible(c: char) -> bool {
    if c.is_whitespace() {
        return false;
    }

    matches!(
        c,
        '\u{00ad}'
            | '\u{034f}'
            | '\u{061c}'
            | '\u{115f}'
            | '\u{1160}'
            | '\u{17b4}'..='\u{17b5}'
            | '\u{180b}'..='\u{180e}'
            | '\u{200b}'..='\u{200f}'
            | '\u{202a}'..='\u{202e}'
            | '\u{2060}'..='\u{2064}'
            | '\u{2066}'..='\u{206f}'
            | '\u{3164}'
            | '\u{fe00}'..='\u{fe0f}'
            | '\u{feff}'
            | '\u{fff9}'..='\u{fffb}'
            | '\u{1d173}'..='\u{1d17a}'
            | '\u{e0000}'..='\u{e007f}'
    ) || c.is_control()
}

/// Discord's markdown characters. They carry no content for a duplicate check
/// and are trivially added to defeat one.
///
/// Angle brackets are absent because the replacement tokens above use them.
const fn is_markdown(c: char) -> bool {
    matches!(c, '*' | '_' | '~' | '`' | '|' | '#' | '-' | '=' | '+')
}

/// Jaccard similarity over character trigrams, in `0.0..=1.0`.
///
/// Symmetric and order-insensitive over local windows, so a reordered or lightly
/// edited copy still scores high. Falls back to exact equality when either side
/// is too short to form a trigram, since the ratio is undefined at 0/0.
#[must_use]
pub fn similarity(a: &str, b: &str) -> f64 {
    let left = trigrams(a);
    let right = trigrams(b);

    if left.is_empty() || right.is_empty() {
        return f64::from(u8::from(a == b));
    }

    // Both sides are bounded by MAX_NORMALIZED_CHARS, so a count here never
    // exceeds 512 and the cast to f64 is exact.
    #[allow(clippy::cast_precision_loss)]
    let intersection = left.intersection(&right).count() as f64;
    #[allow(clippy::cast_precision_loss)]
    let union = (left.len() + right.len()) as f64 - intersection;

    intersection / union
}

fn trigrams(text: &str) -> HashSet<[char; 3]> {
    let chars: Vec<char> = text.chars().collect();
    chars.windows(3).map(|w| [w[0], w[1], w[2]]).collect()
}

/// Records the message in the rolling window and reports whether the same text
/// has now reached `min_channels` distinct channels.
///
/// `min_length` is checked against the normalized text, not the raw content, so
/// padding a message with zero-width characters buys no exemption.
pub async fn check_and_record(
    redis: &Client,
    guild_id: GuildId,
    user_id: UserId,
    channel_id: ChannelId,
    message_id: MessageId,
    content: &str,
    rule: &CrossChannelSpamRule,
) -> Result<DuplicateVerdict> {
    let normalized = normalize(content);
    // The normalized length is the one that counts: raw length would let a
    // spammer pad with zero-width characters past the gate.
    if normalized.chars().count() < rule.min_length as usize {
        debug!(
            normalized_length = normalized.chars().count(),
            min_length = rule.min_length,
            "message skipped by cross channel duplicate filter"
        );
        return Ok(DuplicateVerdict::Pass);
    }

    let window = Duration::from_secs(rule.window_seconds);
    let now = unix_now();
    let key = keys::cross_channel_records_key(guild_id, user_id);

    cache::record_duplicate_window(
        redis,
        &key,
        now,
        now - window.as_secs_f64(),
        window,
        &serialize_hit(channel_id, message_id, &normalized),
        MAX_WINDOW_ENTRIES,
    )
    .await?;

    let entries =
        cache::read_duplicate_window(redis, &key, now - window.as_secs_f64(), MAX_WINDOW_ENTRIES)
            .await?;

    // The message under evaluation was just recorded, so it is in `entries` and
    // matches itself, which is what puts its own channel in the count.
    let hits = matching_hits(&normalized, &entries, rule.similarity_threshold);
    let channels: HashSet<ChannelId> = hits.iter().map(|hit| hit.channel_id).collect();
    if channels.len() < rule.min_channels as usize {
        debug!(
            distinct_channels = channels.len(),
            min_channels = rule.min_channels,
            "message within the cross channel duplicate limit"
        );
        return Ok(DuplicateVerdict::Pass);
    }

    debug!(
        distinct_channels = channels.len(),
        min_channels = rule.min_channels,
        "message flagged by cross channel duplicate filter"
    );
    Ok(DuplicateVerdict::Trip { hits })
}

/// Drops the matched copies from the window so a repeated offender does not
/// make the next message retry deletes against messages that are already gone.
pub async fn forget_copies(
    redis: &Client,
    guild_id: GuildId,
    user_id: UserId,
    hits: &[DuplicateHit],
) -> Result<()> {
    if hits.is_empty() {
        return Ok(());
    }

    let key = keys::cross_channel_records_key(guild_id, user_id);
    let members: Vec<&str> = hits.iter().map(|hit| hit.member.as_str()).collect();

    cache::forget_duplicate_copies(redis, &key, &members).await
}

/// Collects the entries matching `normalized`, keeping one hit per channel.
///
/// The first hit for a channel wins so the purge list stays the size of the
/// channel count rather than the window size.
fn matching_hits(normalized: &str, entries: &[String], threshold: f64) -> Vec<DuplicateHit> {
    let mut seen: HashSet<ChannelId> = HashSet::new();
    let mut hits = Vec::new();

    for entry in entries {
        let Some((channel_id, message_id, text)) = parse_hit(entry) else {
            continue;
        };
        // Dedupe after the similarity check, not before: the newest entry for a
        // channel can be an unrelated message while an older one still matches,
        // and marking the channel seen first would discard that match.
        if similarity(normalized, text) < threshold || !seen.insert(channel_id) {
            continue;
        }
        hits.push(DuplicateHit {
            channel_id,
            message_id,
            member: entry.clone(),
        });
    }

    hits
}

fn serialize_hit(channel_id: ChannelId, message_id: MessageId, normalized: &str) -> String {
    format!("{channel_id}\u{1f}{message_id}\u{1f}{normalized}")
}

fn parse_hit(entry: &str) -> Option<(ChannelId, MessageId, &str)> {
    let mut parts = entry.splitn(3, '\u{1f}');
    let channel_id = parts.next()?.parse().ok()?;
    let message_id = parts.next()?.parse().ok()?;
    Some((channel_id, message_id, parts.next().unwrap_or_default()))
}

fn unix_now() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs_f64()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::automod::types::PriorCopies;

    #[test]
    fn prior_copies_keep_deletes_nothing() {
        assert_eq!(PriorCopies::default().delete_limit(), Some(0));
    }

    #[test]
    fn prior_copies_delete_with_no_limit_is_unbounded() {
        // Reported as u32::MAX rather than None so the caller applies one cap.
        assert_eq!(
            PriorCopies::Delete { limit: None }.delete_limit(),
            Some(u32::MAX)
        );
    }

    #[test]
    fn prior_copies_delete_keeps_an_explicit_limit() {
        assert_eq!(
            PriorCopies::Delete { limit: Some(5) }.delete_limit(),
            Some(5)
        );
    }

    #[test]
    fn prior_copies_round_trips_through_json() {
        // The tagged form is what lands in the settings JSONB, so the shape is
        // part of the config contract rather than a serialization detail.
        assert_eq!(
            serde_json::to_value(PriorCopies::Keep).expect("Keep should serialize"),
            serde_json::json!({ "mode": "KEEP" })
        );
        assert_eq!(
            serde_json::to_value(PriorCopies::Delete { limit: Some(5) })
                .expect("Delete should serialize"),
            serde_json::json!({ "mode": "DELETE", "limit": 5 })
        );
        assert_eq!(
            serde_json::to_value(PriorCopies::Delete { limit: None })
                .expect("unbounded Delete should serialize"),
            serde_json::json!({ "mode": "DELETE", "limit": null })
        );
    }

    #[test]
    fn a_delete_policy_never_selects_the_triggering_message() {
        // The current message is in `hits` because it matches itself. Deleting it
        // is the action list's job, so the copy filter has to skip it, or a
        // Delete policy with no Delete action would still remove it.
        let current = DuplicateHit {
            channel_id: ChannelId::new(1),
            message_id: MessageId::new(10),
            member: serialize_hit(ChannelId::new(1), MessageId::new(10), "buy my server now"),
        };
        let prior = DuplicateHit {
            channel_id: ChannelId::new(2),
            message_id: MessageId::new(11),
            member: serialize_hit(ChannelId::new(2), MessageId::new(11), "buy my server now"),
        };

        let message_id = current.message_id;
        let to_delete: Vec<_> = [current, prior]
            .into_iter()
            .filter(|hit| hit.message_id != message_id)
            .collect();

        assert_eq!(to_delete.len(), 1);
        assert_eq!(to_delete[0].message_id, MessageId::new(11));
    }

    #[test]
    fn prior_copies_defaults_when_the_field_is_absent() {
        // serde(default) is what lets a row written before this field existed
        // load without the whole rule falling back to GuildSettings::default().
        let raw = serde_json::json!({
            "enabled": true,
            "action": ["DELETE"],
            "timeoutDurationSeconds": null,
            "scope": { "mode": "EXEMPT", "roles": [], "channels": [] },
            "minChannels": 3,
            "windowSeconds": 600,
            "similarityThreshold": 0.85,
            "minLength": 15,
        });

        let rule: CrossChannelSpamRule =
            serde_json::from_value(raw).expect("a rule without priorCopies should parse");

        assert_eq!(rule.prior_copies, PriorCopies::Keep);
    }

    #[test]
    fn normalize_strips_zero_width_characters() {
        assert_eq!(normalize("he\u{200b}llo world"), "hello world");
        assert_eq!(normalize("he\u{200d}llo\u{2060} world"), "hello world");
        assert_eq!(normalize("join\u{feff}now"), "joinnow");
    }

    #[test]
    fn normalize_replaces_urls_with_a_token() {
        assert_eq!(
            normalize("join https://discord.gg/aaa now"),
            "join <url> now"
        );
        assert_eq!(
            normalize("join http://discord.gg/bbb now"),
            "join <url> now"
        );
    }

    #[test]
    fn normalize_replaces_mentions_with_a_token() {
        assert_eq!(normalize("hey <@123456789> look"), "hey <mention> look");
        assert_eq!(normalize("hey <@&123456789> look"), "hey <mention> look");
    }

    #[test]
    fn normalize_strips_markdown_and_collapses_whitespace() {
        assert_eq!(normalize("**bold**  __text__"), "bold text");
        assert_eq!(normalize("line   one\n\n\ttwo"), "line one two");
    }

    #[test]
    fn normalize_truncates_at_the_boundary() {
        let long = "a".repeat(MAX_NORMALIZED_CHARS + 50);
        assert_eq!(normalize(&long).chars().count(), MAX_NORMALIZED_CHARS);
    }

    #[test]
    fn similarity_of_identical_text_is_one() {
        assert!((similarity("buy my server now", "buy my server now") - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn similarity_of_disjoint_text_is_zero() {
        assert_eq!(similarity("aaaaaaaaaa", "zzzzzzzzzz"), 0.0);
    }

    #[test]
    fn similarity_survives_a_single_character_edit() {
        let score = similarity(
            "join my server right now it is a great place",
            "join my servers right now it is a great place",
        );
        assert!(score > 0.85, "single edit scored {score}");
    }

    #[test]
    fn similarity_falls_back_to_equality_when_too_short() {
        assert_eq!(similarity("ab", "ab"), 1.0);
        assert_eq!(similarity("ab", "ac"), 0.0);
        assert_eq!(similarity("", ""), 1.0);
        assert_eq!(similarity("", "a"), 0.0);
    }

    #[test]
    fn matching_hits_counts_each_channel_once() {
        let a = ChannelId::new(1);
        let b = ChannelId::new(2);
        let entries = vec![
            serialize_hit(a, MessageId::new(10), "buy my server now"),
            serialize_hit(a, MessageId::new(11), "buy my server now"),
            serialize_hit(b, MessageId::new(12), "buy my server now"),
        ];

        let hits = matching_hits("buy my server now", &entries, 0.85);

        assert_eq!(hits.len(), 2);
        assert_eq!(
            hits.iter().map(|h| h.message_id).collect::<Vec<_>>(),
            vec![MessageId::new(10), MessageId::new(12)]
        );
    }

    #[test]
    fn matching_hits_keeps_a_match_when_a_newer_copy_in_the_same_channel_differs() {
        // Entries arrive newest first. The newest copy in this channel is an
        // unrelated message, but the older one still matches and must count.
        let a = ChannelId::new(1);
        let entries = vec![
            serialize_hit(
                a,
                MessageId::new(20),
                "unrelated chatter about gardening tools",
            ),
            serialize_hit(a, MessageId::new(10), "buy my server now"),
        ];

        let hits = matching_hits("buy my server now", &entries, 0.85);

        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].message_id, MessageId::new(10));
    }

    #[test]
    fn matching_hits_carries_the_member_verbatim_for_zrem() {
        let entry = serialize_hit(ChannelId::new(1), MessageId::new(10), "buy my server now");
        let hits = matching_hits("buy my server now", &[entry.clone()], 0.85);

        assert_eq!(hits[0].member, entry);
    }

    #[test]
    fn matching_hits_ignores_below_threshold_entries() {
        let a = ChannelId::new(1);
        let entries = vec![serialize_hit(
            a,
            MessageId::new(10),
            "completely unrelated conversation about gardening",
        )];

        assert!(matching_hits("buy my server now", &entries, 0.85).is_empty());
    }

    #[test]
    fn a_rotated_invite_still_matches() {
        // The whole point of replacing URLs with a token: these two are barely
        // similar as raw text but identical once normalized.
        let a = normalize("join https://discord.gg/aaa now");
        let b = normalize("join https://discord.gg/bbb now");

        assert_eq!(similarity(&a, &b), 1.0);
    }

    #[test]
    fn parse_hit_rejects_a_malformed_member() {
        assert!(parse_hit("not-a-snowflake\u{1f}1\u{1f}text").is_none());
        assert!(parse_hit("").is_none());
    }

    #[test]
    fn parse_hit_round_trips_a_serialized_hit() {
        let channel_id = ChannelId::new(7);
        let message_id = MessageId::new(99);
        let entry = serialize_hit(channel_id, message_id, "hello there");

        let parsed = parse_hit(&entry).expect("member should parse");

        assert_eq!(parsed.0, channel_id);
        assert_eq!(parsed.1, message_id);
        assert_eq!(parsed.2, "hello there");
    }
}
