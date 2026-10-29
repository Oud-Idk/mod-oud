use fred::interfaces::ClientLike;
use serde::{Deserialize, Serialize};
use std::time::Instant;
use sysinfo::{ProcessesToUpdate, System};
use tracing::{debug, warn};

/// Holds latency and health status for the PostgreSQL database.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DatabaseTelemetry {
    /// Whether the database query probe succeeded.
    pub healthy: bool,
    /// Response latency in milliseconds for executing `SELECT 1`.
    pub latency_ms: Option<f64>,
}

/// Holds latency and health status for the Redis connection.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RedisTelemetry {
    /// Whether the Redis ping probe succeeded.
    pub healthy: bool,
    /// Response latency in milliseconds for executing `PING`.
    pub latency_ms: Option<f64>,
}

/// Holds memory usage in megabytes for the bot shard and ML inference service.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MemoryTelemetry {
    /// Resident memory in megabytes consumed by the current bot shard process.
    pub bot_mb: Option<f64>,
    /// Resident memory in megabytes consumed by the ML inference process if present.
    pub ml_mb: Option<f64>,
}

/// Holds Discord gateway shard metadata and latency.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ShardTelemetry {
    /// Zero-based identifier of the current shard.
    pub shard_id: u32,
    /// Total number of shards running across the bot cluster.
    pub total_shards: u32,
    /// Heartbeat round-trip latency in milliseconds reported by Discord gateway.
    pub gateway_latency_ms: Option<u64>,
}

/// Aggregated system telemetry report containing database, cache, memory, and shard status.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TelemetryReport {
    /// PostgreSQL connection health and latency metrics.
    pub database: DatabaseTelemetry,
    /// Redis connection health and latency metrics.
    pub redis: RedisTelemetry,
    /// System memory usage metrics for the bot shard and ML inference.
    pub memory: MemoryTelemetry,
    /// Discord gateway shard metrics, if probed within a bot context.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shard: Option<ShardTelemetry>,
}

/// Helper: Converts raw memory bytes into megabytes.
#[expect(clippy::cast_precision_loss, reason = "Memory won't exceed 8 PiB")]
fn bytes_to_mb(bytes: u64) -> f64 {
    bytes as f64 / 1024.0 / 1024.0
}

/// Retrieves the current process memory usage in megabytes.
fn get_bot_memory(sys: &System) -> Option<f64> {
    sysinfo::get_current_pid()
        .ok()
        .and_then(|pid| sys.process(pid))
        .map(|p| bytes_to_mb(p.memory()))
}

/// Searches for processes matching `name` (like `ml-inference`), sums up their memory in MB.
fn get_target_process_memory(sys: &System, name: &str) -> Option<f64> {
    let total_bytes: u64 = sys
        .processes()
        .values()
        .filter(|p| p.name().to_string_lossy().contains(name))
        .map(sysinfo::Process::memory)
        .sum();

    if total_bytes > 0 {
        Some(bytes_to_mb(total_bytes))
    } else {
        None
    }
}

/// Probes the system memory usage for both the bot shard and ML inference.
pub fn probe_memory() -> MemoryTelemetry {
    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::All, true);

    MemoryTelemetry {
        bot_mb: get_bot_memory(&sys),
        ml_mb: get_target_process_memory(&sys, "ml-inference"),
    }
}

/// Probes PostgreSQL connection health and measures query latency.
pub async fn probe_database(pool: &sqlx::PgPool) -> DatabaseTelemetry {
    let start = Instant::now();
    let query_res = sqlx::query("SELECT 1").execute(pool).await;
    let latency_ms = start.elapsed().as_secs_f64() * 1000.0;

    match query_res {
        Ok(_) => {
            debug!(latency_ms, "PostgreSQL database connection is healthy");
            DatabaseTelemetry {
                healthy: true,
                latency_ms: Some(latency_ms),
            }
        }
        Err(err) => {
            warn!(error = ?err, "PostgreSQL database connection check failed");
            DatabaseTelemetry {
                healthy: false,
                latency_ms: None,
            }
        }
    }
}

/// Probes Redis connection health and measures ping latency.
pub async fn probe_redis(redis: &fred::clients::Client) -> RedisTelemetry {
    let start = Instant::now();
    let ping_res: Result<String, _> = redis.ping(None).await;
    let latency_ms = start.elapsed().as_secs_f64() * 1000.0;

    match ping_res {
        Ok(_) => {
            debug!(latency_ms, "Redis cache connection is healthy");
            RedisTelemetry {
                healthy: true,
                latency_ms: Some(latency_ms),
            }
        }
        Err(err) => {
            warn!(error = ?err, "Redis cache connection check failed");
            RedisTelemetry {
                healthy: false,
                latency_ms: None,
            }
        }
    }
}

/// Collects an aggregated telemetry report for core services (database, redis, memory).
pub async fn collect_core_telemetry(
    pool: &sqlx::PgPool,
    redis: &fred::clients::Client,
) -> TelemetryReport {
    let (database, redis) = tokio::join!(probe_database(pool), probe_redis(redis));
    let memory = probe_memory();

    TelemetryReport {
        database,
        redis,
        memory,
        shard: None,
    }
}
