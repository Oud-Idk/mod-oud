use axum::http::StatusCode;
use hmac::{Hmac, KeyInit, Mac};
use quick_xml::Reader;
use quick_xml::events::Event;
use sha2::Sha256;
use sha1::Sha1;
use tracing::{error, info};
use uuid::Uuid;
use crate::features::social_notifications::types::FeedKind;

pub fn discover_feed_kind(feed_url: &str, xml: &str) -> FeedKind {

    let discovered = scan_xml_for_hub(&xml);

    if let Some(hub_url) = discovered.hub_url {
        return FeedKind::PubSubHubbub {
            hub_url,
            topic: discovered.topic.unwrap_or_else(|| feed_url.to_string()),
            lease_expires_at: None,
        };
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
    let form_params = [
        ("hub.callback", callback_url),
        ("hub.mode", "subscribe"),
        ("hub.topic", topic),
        ("hub.secret", secret),
    ];

    info!(hub = %hub_url, topic = %topic, callback = %callback_url, "Sending WebSub subscription request...");

    let resp = client
        .post(hub_url)
        .form(&form_params)
        .send()
        .await?;

    // Per spec, hubs usually respond with 202 Accepted
    if resp.status().is_success() || resp.status() == StatusCode::ACCEPTED {
        info!("Hub accepted subscription request! Verification underway...");
        Ok(())
    } else {
        let status = resp.status();
        let err_text = resp.text().await.unwrap_or_default();
        error!(status = %status, error = %err_text, "WebSub Hub rejected subscription request");
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
            let Ok(mut mac) = Hmac::<Sha256>::new_from_slice(secret.as_bytes()) else { return false };
            mac.update(body);
            mac.verify_slice(&expected_bytes).is_ok()
        }
        "sha1" => {
            let Ok(mut mac) = Hmac::<Sha1>::new_from_slice(secret.as_bytes()) else { return false };
            mac.update(body);
            mac.verify_slice(&expected_bytes).is_ok()
        }
        _ => false,
    }
}