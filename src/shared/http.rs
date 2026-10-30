//! Credential-safe rendering for the third-party HTTP calls.
//!
//! `reqwest::Error` embeds the full request URL in **both** its `Display` and its `Debug`, and
//! several providers authenticate in the query string. So `error = %e` and `error = ?e` are both
//! a way to print an API key. Log a redacted URL and a described error instead, and never let the
//! raw error reach an `anyhow` chain that something above will print.
//!

use reqwest::dns::{Addrs, Name, Resolve, Resolving};
use reqwest::redirect::Policy;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::sync::Arc;

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
} // ---------------------------------------------------------------------------
// SSRF Protection & Safe HTTP Client
// ---------------------------------------------------------------------------

/// Evaluates whether an IP address belongs to a private, loopback, link-local,
/// or reserved network.
#[must_use]
pub fn is_safe_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_safe_ipv4(v4),
        IpAddr::V6(v6) => {
            if let Some(v4) = v6.to_ipv4_mapped() {
                return is_safe_ipv4(v4);
            }
            is_safe_ipv6(v6)
        }
    }
}

fn is_safe_ipv4(ip: Ipv4Addr) -> bool {
    if ip.is_unspecified()
        || ip.is_loopback()
        || ip.is_private()
        || ip.is_link_local()
        || ip.is_broadcast()
        || ip.is_multicast()
    {
        return false;
    }

    let octets = ip.octets();
    // 100.64.0.0/10 (Carrier-Grade NAT)
    if octets[0] == 100 && (octets[1] & 0xc0) == 64 {
        return false;
    }
    // 192.0.0.0/24 (IETF Protocol Assignments)
    if octets[0] == 192 && octets[1] == 0 && octets[2] == 0 {
        return false;
    }
    // 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 (Documentation / Test-Net)
    if (octets[0] == 192 && octets[1] == 0 && octets[2] == 2)
        || (octets[0] == 198 && octets[1] == 51 && octets[2] == 100)
        || (octets[0] == 203 && octets[1] == 0 && octets[2] == 113)
    {
        return false;
    }
    // 198.18.0.0/15 (Benchmarking)
    if octets[0] == 198 && (octets[1] & 0xfe) == 18 {
        return false;
    }
    // 240.0.0.0/4 (Reserved / Former Class E)
    if octets[0] >= 240 {
        return false;
    }

    true
}

fn is_safe_ipv6(ip: Ipv6Addr) -> bool {
    if ip.is_unspecified() || ip.is_loopback() || ip.is_multicast() {
        return false;
    }

    let segments = ip.segments();
    // fc00::/7 (Unique Local Address - ULA)
    if (segments[0] & 0xfe00) == 0xfc00 {
        return false;
    }
    // fe80::/10 (Link-Local Unicast)
    if (segments[0] & 0xffc0) == 0xfe80 {
        return false;
    }
    // 2001:db8::/32 (Documentation)
    if segments[0] == 0x2001 && segments[1] == 0xdb8 {
        return false;
    }
    // 100::/64 (Discard Prefix)
    if segments[0] == 0x100 && segments[1] == 0 && segments[2] == 0 && segments[3] == 0 {
        return false;
    }

    true
}

/// Synchronous syntax & literal IP check for URLs.
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

    if let Ok(ip) = host.parse::<IpAddr>() {
        return is_safe_ip(ip);
    }

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

/// Asynchronously resolves DNS and verifies that ALL resolved IP addresses are public.
pub async fn is_safe_destination_async(url: &str) -> bool {
    if !is_safe_destination(url) {
        return false;
    }

    let Ok(parsed) = reqwest::Url::parse(url) else {
        return false;
    };
    let Some(host) = parsed.host_str() else {
        return false;
    };

    if host.trim_matches(['[', ']']).parse::<IpAddr>().is_ok() {
        return true;
    }

    let port = parsed.port_or_known_default().unwrap_or(80);
    let Ok(addrs) = tokio::net::lookup_host((host, port)).await else {
        return false;
    };

    let mut count = 0;
    for addr in addrs {
        count += 1;
        if !is_safe_ip(addr.ip()) {
            return false;
        }
    }

    count > 0
}

/// Custom DNS resolver for reqwest that filters out non-public IP addresses.
#[derive(Clone)]
pub struct SafeDnsResolver;

impl Resolve for SafeDnsResolver {
    fn resolve(&self, name: Name) -> Resolving {
        Box::pin(async move {
            let host = name.as_str();
            let addrs = tokio::net::lookup_host((host, 0)).await?;
            let safe: Vec<SocketAddr> = addrs.filter(|addr| is_safe_ip(addr.ip())).collect();

            if safe.is_empty() {
                return Err(Box::new(std::io::Error::new(
                    std::io::ErrorKind::PermissionDenied,
                    "Destination resolved to a restricted IP address",
                ))
                    as Box<dyn std::error::Error + Send + Sync>);
            }

            let addrs: Addrs = Box::new(safe.into_iter());
            Ok(addrs)
        })
    }
}

/// Creates a reqwest client configured to prevent SSRF (validates DNS and redirects).
pub fn build_safe_http_client() -> Result<reqwest::Client, reqwest::Error> {
    reqwest::Client::builder()
        .dns_resolver(Arc::new(SafeDnsResolver))
        .redirect(Policy::custom(|attempt| {
            if attempt.previous().len() >= 5 {
                return attempt.error("Too many redirects");
            }
            if !is_safe_destination(attempt.url().as_str()) {
                return attempt.error("Redirect to restricted destination blocked");
            }
            attempt.follow()
        }))
        .build()
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
