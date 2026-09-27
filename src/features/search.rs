mod commands;
mod dictionary;
mod events;
mod genius;
mod giphy;
mod http;
// Two features now hold a keyed API token and log request urls, so the redactor is shared rather
// than reached into through a private module.
pub use http::redact_url;
mod kitsu;
mod klipy;
mod open_meteo;
mod pick;
mod pokeapi;
mod rawg;
mod spotify;
mod tmdb;
mod urban;
mod wikipedia;
mod youtube;

pub use commands::search;
pub use events::handle_search_play;
pub use pick::choose_or_first;

/// Shortens `s` to at most `max` bytes, appending an ellipsis.
///
/// Cuts on a char boundary. Every caller passes upstream text, so a byte slice would panic on
/// the first multi-byte character in a YouTube description or a dictionary entry.
pub(crate) fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    if max <= 3 {
        return ".".repeat(max);
    }

    let mut end = max - 3;
    while !s.is_char_boundary(end) {
        end -= 1;
    }

    if end == 0 {
        return ".".repeat(max);
    }

    format!("{}...", &s[..end])
}

#[cfg(test)]
mod truncate_tests {
    use super::truncate;

    #[test]
    fn leaves_short_strings_alone() {
        assert_eq!(truncate("hello", 100), "hello");
    }

    #[test]
    fn leaves_exact_length_strings_alone() {
        assert_eq!(truncate("hello", 5), "hello");
    }

    #[test]
    fn cuts_ascii_cleanly() {
        assert_eq!(truncate("hello world", 8), "hello...");
    }

    #[test]
    fn never_splits_a_multibyte_char() {
        // Each emoji is 4 bytes, so a naive byte slice at 7 would panic.
        let s = "\u{1F600}\u{1F600}\u{1F600}\u{1F600}";
        let out = truncate(s, 10);
        assert!(out.len() <= 10, "{}", out.len());
        assert!(out.ends_with("..."), "{out}");
    }

    #[test]
    fn handles_cjk_text() {
        let s = "\u{4F60}\u{597D}\u{4E16}\u{754C}";
        let out = truncate(s, 8);
        assert!(out.len() <= 8, "{}", out.len());
    }

    #[test]
    fn survives_a_tiny_max() {
        for max in 0..=4 {
            let out = truncate("\u{1F600}\u{1F600}abcdef", max);
            assert_eq!(out.len(), max, "max={max} out={out:?}");
        }
    }
}
