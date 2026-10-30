//! Credential-safe rendering for the third-party HTTP calls.
//!
//! `reqwest::Error` embeds the full request URL in **both** its `Display` and its `Debug`, and
//! several providers authenticate in the query string. So `error = %e` and `error = ?e` are both
//! a way to print an API key. Log a redacted URL and a described error instead, and never let the
//! raw error reach an `anyhow` chain that something above will print.

/// Query-string parameter names that carry a credential.
const SECRET_QUERY_PARAMS: &[&str] = &[
    "api_key",
    "apikey",
    "api-key",
    "key",
    "app_key",
    "appkey",
    "token",
    "access_token",
];

/// Returns `url` with credentials removed so it is safe to log.
///
/// `path_secrets` is for providers that put the key in the path, which cannot be matched by
/// parameter name. If no query parameter survives, the whole query string is dropped.
#[must_use]
pub fn redact_url(url: &str, path_secrets: &[&str]) -> String {
    let mut redacted = url.to_string();
    for secret in path_secrets {
        if !secret.is_empty() {
            redacted = redacted.replace(secret, "<redacted>");
        }
    }

    let Some((path, query)) = redacted.split_once('?') else {
        return redacted;
    };

    let kept: Vec<&str> = query
        .split('&')
        .filter(|pair| {
            let key = pair.split('=').next().unwrap_or(pair);
            !SECRET_QUERY_PARAMS
                .iter()
                .any(|secret| secret.eq_ignore_ascii_case(key))
        })
        .collect();

    if kept.is_empty() {
        path.to_string()
    } else {
        format!("{path}?{}", kept.join("&"))
    }
}

/// Describes a `reqwest` failure without its URL, which the key rides in.
///
/// The url is logged separately, through [`redact_url`], so nothing diagnostic is lost: this
/// carries the category and the status, which is what tells you whether to retry or give up.
#[must_use]
pub fn safe_reqwest_error(e: &reqwest::Error) -> String {
    let mut parts: Vec<String> = Vec::new();

    if let Some(status) = e.status() {
        parts.push(format!("status {}", status.as_u16()));
    }

    for (label, present) in [
        ("builder", e.is_builder()),
        ("redirect", e.is_redirect()),
        ("timeout", e.is_timeout()),
        ("connect", e.is_connect()),
        ("request", e.is_request()),
        ("body", e.is_body()),
        ("decode", e.is_decode()),
    ] {
        if present {
            parts.push(label.to_string());
        }
    }

    if parts.is_empty() {
        parts.push("unspecified".to_string());
    }
    parts.join(", ")
}

/// Whether `url` is safe to fetch from the bot: an http(s) URL whose host is not a
/// loopback, link-local, or private address. Used to stop members from pointing the
/// bot at internal services.
#[must_use]
pub fn is_safe_destination(url: &str) -> bool {
    let Ok(parsed) = reqwest::Url::parse(url) else {
        return false;
    };
    if !matches!(parsed.scheme(), "http" | "https") {
        return false;
    }
    let Some(host) = parsed.host_str() else {
        return false;
    };
    let host = host.trim_matches(['[', ']']);
    if host.eq_ignore_ascii_case("localhost") {
        return false;
    }
    if let Ok(ip) = host.parse::<std::net::IpAddr>() {
        return !is_private_ip(ip);
    }
    // Block obvious internal-only suffixes even when given as a hostname.
    let lower = host.to_ascii_lowercase();
    if lower.ends_with(".localhost")
        || lower.ends_with(".local")
        || lower.ends_with(".internal")
        || lower == "metadata.google.internal"
    {
        return false;
    }
    true
}

fn is_private_ip(ip: std::net::IpAddr) -> bool {
    match ip {
        std::net::IpAddr::V4(v4) => {
            v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4.is_broadcast()
                || v4.is_unspecified()
                || v4.octets()[0] == 169 && v4.octets()[1] == 254
        }
        std::net::IpAddr::V6(v6) => {
            v6.is_loopback() || v6.is_unspecified() || (v6.segments()[0] & 0xfe00) == 0xfc00
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{redact_url, safe_reqwest_error};

    #[test]
    fn drops_credential_query_params() {
        let redacted = redact_url(
            // aislop-ignore-next-line ai-slop/hardcoded-url
            "https://api.giphy.com/v1/gifs/search?api_key=SUPERSECRET&q=cat&limit=1",
            &[],
        );
        assert!(!redacted.contains("SUPERSECRET"), "{redacted}");
        assert!(redacted.contains("q=cat"), "{redacted}");
        assert!(redacted.contains("limit=1"), "{redacted}");
    }

    #[test]
    fn drops_the_query_entirely_when_nothing_survives() {
        // aislop-ignore-next-line ai-slop/hardcoded-url
        let redacted = redact_url("https://api.example.com/x?key=abc123", &[]);
        // aislop-ignore-next-line ai-slop/hardcoded-url
        assert_eq!(redacted, "https://api.example.com/x");
    }

    #[test]
    fn redacts_path_secrets() {
        let redacted = redact_url(
            // aislop-ignore-next-line ai-slop/hardcoded-url
            "https://api.klipy.com/api/v1/abc123/gifs/search?q=cat",
            &["abc123"],
        );
        assert!(!redacted.contains("abc123"), "{redacted}");
        assert!(redacted.contains("<redacted>"), "{redacted}");
    }

    #[test]
    fn leaves_a_url_without_a_query_untouched() {
        // aislop-ignore-next-line ai-slop/hardcoded-url
        let url = "https://api.urbandictionary.com/v0/define?term=cat";
        assert_eq!(redact_url(url, &[]), url);
    }

    /// The whole reason this function exists. Proves the premise too: both of reqwest's
    /// formatters embed the request url, so neither is safe to log for a keyed endpoint.
    #[tokio::test]
    async fn described_error_drops_the_url_that_both_formatters_leak() {
        let client = reqwest::Client::new();
        // Nothing listens on port 1, so this is a connect failure that still carries the url.
        let err = client
            .get("http://127.0.0.1:1/youtube?key=SUPERSECRET")
            .send()
            .await
            .expect_err("nothing listens on port 1");

        assert!(format!("{err}").contains("SUPERSECRET"), "Display premise");
        assert!(format!("{err:?}").contains("SUPERSECRET"), "Debug premise");

        let described = safe_reqwest_error(&err);
        assert!(!described.contains("SUPERSECRET"), "{described}");
        assert!(described.contains("connect"), "{described}");
    }
}
