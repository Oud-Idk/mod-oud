use crate::features::social_notifications::types::FeedKind;
use axum::http::StatusCode;
use hmac::{Hmac, KeyInit, Mac};
use quick_xml::Reader;
use quick_xml::events::Event;
use sha1::Sha1;
use sha2::Sha256;
use tracing::{info, warn};
use uuid::Uuid;

pub fn discover_feed_kind(feed_url: &str, xml: &str) -> FeedKind {
    let discovered = scan_xml_for_hub(&xml);

    if let Some(hub_url) = discovered.hub_url {
        if is_secure_hub(&hub_url) {
            return FeedKind::PubSubHubbub {
                hub_url,
                topic: discovered.topic.unwrap_or_else(|| feed_url.to_string()),
                lease_expires_at: None,
            };
        }

        warn!(
            hub = %hub_url,
            fallback = "polling",
            "plaintext WebSub hub ignored"
        );
    }

    if let Some(override_hub) = detect_known_hub(feed_url) {
        return FeedKind::PubSubHubbub {
            hub_url: override_hub.hub_url.to_string(),
            topic: override_hub.topic,
            lease_expires_at: None,
        };
    }

    FeedKind::Polling {
        interval_secs: 600,
        last_polled_at: None,
    }
}

/// Whether a hub URL is safe to hand `hub.secret` to.
///
/// That secret is the key every `X-Hub-Signature` callback is verified against,
/// so a plaintext hub would let anyone on the network path forge feed posts into
/// the server. Discovery refuses such hubs, and [`request_hub_subscription`]
/// re-checks so rows stored before this rule existed cannot leak either.
fn is_secure_hub(hub_url: &str) -> bool {
    reqwest::Url::parse(hub_url).is_ok_and(|url| url.scheme() == "https")
}

struct Discovered {
    hub_url: Option<String>,
    topic: Option<String>,
}

fn scan_xml_for_hub(xml: &str) -> Discovered {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut hub = None;
    let mut topic = None;
    let mut buf = Vec::new();

    loop {
        buf.clear();

        // Bail on EOF/Err, skip any event that isn't a <link>
        let event = match reader.read_event_into(&mut buf) {
            Ok(Event::Eof) | Err(_) => break,
            Ok(ev) => ev,
        };

        // Only care about <link> tags, skip everything else
        let e = match event {
            Event::Empty(ref e) | Event::Start(ref e) if e.local_name().as_ref() == "link" => e,
            _ => continue,
        };

        let mut rel = None;
        let mut href = None;

        for attr in e.attributes().flatten() {
            match attr.key.local_name().as_ref() {
                "rel" => rel = Some(attr.value.to_string()),
                "href" => href = Some(attr.value.to_string()),
                _ => {}
            }
        }

        match (rel.as_deref(), href) {
            (Some("hub"), Some(url)) => hub = Some(url),
            (Some("self"), Some(url)) => topic = Some(url),
            _ => {}
        }

        if hub.is_some() && topic.is_some() {
            break;
        }
    }

    Discovered {
        hub_url: hub,
        topic,
    }
}

struct KnownHub {
    hub_url: &'static str,
    topic: String,
}

fn detect_known_hub(feed_url: &str) -> Option<KnownHub> {
    // YouTube topic format MUST match their canonical feeds URL:
    if feed_url.contains("youtube.com/feeds/videos.xml") {
        return Some(KnownHub {
            hub_url: "https://pubsubhubbub.appspot.com",
            topic: feed_url.to_string(),
        });
    }

    // Add more if needed

    None
}

pub async fn request_hub_subscription(
    client: &reqwest::Client,
    hub_url: &str,
    topic: &str,
    callback_url: &str,
    secret: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Guards hubs already stored in the database, which discovery would no longer
    // classify as WebSub but which the renewal worker still tries to reach.
    if !is_secure_hub(hub_url) {
        return Err(format!(
            "Refusing to send hub.secret over a plaintext connection to WebSub hub: {hub_url}"
        )
        .into());
    }

    let form_params = [
        ("hub.callback", callback_url),
        ("hub.mode", "subscribe"),
        ("hub.topic", topic),
        ("hub.secret", secret),
    ];

    let resp = client.post(hub_url).form(&form_params).send().await?;

    // Per spec, hubs usually respond with 202 Accepted
    if resp.status().is_success() || resp.status() == StatusCode::ACCEPTED {
        info!(hub = %hub_url, topic = %topic, "WebSub subscription request accepted by the hub");
        Ok(())
    } else {
        let status = resp.status();
        let err_text = resp.text().await.unwrap_or_default();
        Err(format!("Hub returned {status}: {err_text}").into())
    }
}

pub fn derive_feed_secret(master_secret: &str, feed_id: &Uuid) -> String {
    let mut mac = Hmac::<Sha256>::new_from_slice(master_secret.as_bytes())
        .expect("HMAC can take key of any size");
    mac.update(feed_id.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

pub fn verify_signature(secret: &str, header_val: &str, body: &[u8]) -> bool {
    let (algo, hex_sig) = match header_val.split_once('=') {
        Some(parts) => parts,
        None => return false,
    };

    let Ok(expected_bytes) = hex::decode(hex_sig) else {
        return false;
    };

    match algo {
        "sha256" => {
            let Ok(mut mac) = Hmac::<Sha256>::new_from_slice(secret.as_bytes()) else {
                return false;
            };
            mac.update(body);
            mac.verify_slice(&expected_bytes).is_ok()
        }
        "sha1" => {
            let Ok(mut mac) = Hmac::<Sha1>::new_from_slice(secret.as_bytes()) else {
                return false;
            };
            mac.update(body);
            mac.verify_slice(&expected_bytes).is_ok()
        }
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::{discover_feed_kind, is_secure_hub};
    use crate::features::social_notifications::types::FeedKind;

    /// Mirrors the `rel="hub"` / `rel="self"` pair real feeds advertise.
    fn feed_xml(hub: &str, topic: &str) -> String {
        format!(
            r#"<?xml version="1.0"?>
               <feed xmlns="http://www.w3.org/2005/Atom">
                 <link rel="hub" href="{hub}" />
                 <link rel="self" href="{topic}" />
                 <title>Example</title>
               </feed>"#
        )
    }

    #[test]
    fn plaintext_hubs_are_never_trusted() {
        assert!(!is_secure_hub("http://medium.superfeedr.com"));
        assert!(!is_secure_hub("HTTP://medium.superfeedr.com"));
        assert!(!is_secure_hub("ftp://example.com/hub"));
        assert!(!is_secure_hub("not a url"));
        assert!(!is_secure_hub(""));
    }

    #[test]
    fn https_hubs_are_trusted() {
        assert!(is_secure_hub("https://pubsubhubbub.appspot.com"));
    }

    #[test]
    fn falls_back_to_polling_when_a_feed_advertises_a_plaintext_hub() {
        let xml = feed_xml(
            "http://medium.superfeedr.com",
            "https://medium.com/@blog/feed",
        );

        let kind = discover_feed_kind("https://medium.com/feed/@blog", &xml);

        assert!(
            matches!(
                kind,
                FeedKind::Polling {
                    interval_secs: 600,
                    ..
                }
            ),
            "expected polling fallback for a plaintext hub"
        );
    }

    #[test]
    fn still_uses_websub_when_the_advertised_hub_is_https() {
        let xml = feed_xml(
            "https://pubsubhubbub.appspot.com",
            "https://example.com/feed",
        );

        let FeedKind::PubSubHubbub { hub_url, topic, .. } =
            discover_feed_kind("https://example.com/feed", &xml)
        else {
            panic!("expected WebSub for an https hub");
        };

        assert_eq!(hub_url, "https://pubsubhubbub.appspot.com");
        assert_eq!(topic, "https://example.com/feed");
    }
}
