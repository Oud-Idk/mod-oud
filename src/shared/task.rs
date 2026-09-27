//! The one place background work is spawned, so every task is named and reports its outcome.

use futures::FutureExt as _;
use std::future::Future;
use std::panic::AssertUnwindSafe;
use std::time::Instant;
use tokio::task::JoinHandle;
use tracing::{Instrument, error, info, info_span};

/// Spawns `fut` under a `job` span, logging how it ended.
///
/// An `#[instrument]` on an `async move` block inside `tokio::spawn` wraps no future, which is why
/// a dead worker otherwise has no name in the log. See `docs/logging.md`.
pub fn spawn<F>(name: &'static str, fut: F) -> JoinHandle<F::Output>
where
    F: Future + Send + 'static,
    F::Output: Send + 'static,
{
    let started = Instant::now();
    let span = info_span!("job", job = name);
    tokio::spawn(
        async move {
            match AssertUnwindSafe(fut).catch_unwind().await {
                Ok(output) => {
                    info!(
                        job = name,
                        outcome = "completed",
                        duration_ms = started.elapsed().as_millis(),
                        "job exited"
                    );
                    output
                }
                Err(payload) => {
                    // `fault`, not `error`: a panic payload is not a `std::error::Error`.
                    error!(
                        job = name,
                        outcome = "panicked",
                        duration_ms = started.elapsed().as_millis(),
                        fault = "job panicked",
                        panic = ?payload,
                        "job exited"
                    );
                    // Re-raise, so awaiting the handle still sees the panic.
                    std::panic::resume_unwind(payload);
                }
            }
        }
        .instrument(span),
    )
}
