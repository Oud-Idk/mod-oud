//! The global tracing subscriber, and the filter the process runs under.
//!
//! Lives beside [`crate::shared::task`] so the one line that decides verbosity and the helper that
//! opens spans for background work are configured in the same place. See `docs/logging.md`.

use tracing::info;
use tracing_subscriber::EnvFilter;

/// Log filter used when `RUST_LOG` is unset.
///
/// `EnvFilter::from_default_env()` hardcodes `ERROR` as its fallback directive, and the Docker
/// image never sets `RUST_LOG`, so without this the deployed bot emits almost nothing and every
/// `info!` is silently dropped.
pub const DEFAULT_LOG_FILTER: &str = "info,sqlx=warn,serenity=warn,poise=info";

/// Installs the global tracing subscriber and returns the filter that took effect.
///
/// `pretty` locally and JSON under `LOG_FORMAT=json`: multiline pretty output breaks anything
/// line-oriented downstream, and this process has no other observability.
pub fn init() -> EnvFilter {
    // Must precede reading the filter, so a local `.env` still takes effect.
    dotenvy::dotenv().ok();

    let filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(DEFAULT_LOG_FILTER));
    let json = std::env::var("LOG_FORMAT").is_ok_and(|value| value.eq_ignore_ascii_case("json"));

    let builder = tracing_subscriber::fmt().with_env_filter(filter.clone());
    if json {
        builder
            .json()
            .flatten_event(true)
            .with_current_span(true)
            .with_span_list(true)
            .init();
    } else {
        // `pretty` renders the enclosing span and its fields itself, on a line of its own, so the
        // `process` span's shard_id reaches every line that inherits it.
        builder.pretty().init();
    }

    // The active verbosity would otherwise only be inferable from what is missing.
    let format = if json { "json" } else { "pretty" };
    info!(
        filter = %filter,
        format = %format,
        version = %env!("CARGO_PKG_VERSION"),
        "Tracing initialized"
    );
    filter
}
