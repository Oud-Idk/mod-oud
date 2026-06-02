use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

#[derive(Debug)]
pub struct SpamTracker {
    records: Mutex<HashMap<(u64, u64), Vec<Instant>>>,
    last_warned: Mutex<HashMap<(u64, u64), Instant>>,
    cleanup_counter: Mutex<usize>,
}

impl Default for SpamTracker {
    fn default() -> Self {
        Self {
            records: Mutex::new(HashMap::new()),
            last_warned: Mutex::new(HashMap::new()),
            cleanup_counter: Mutex::new(0),
        }
    }
}

impl SpamTracker {
    pub fn new() -> Self {
        Self::default()
    }

    /// Records a message timestamp and checks if the user has exceeded the limit.
    /// Returns `true` if the user is currently spamming.
    pub fn check_and_record(
        &self,
        guild_id: u64,
        user_id: u64,
        limit: usize,
        window: Duration,
    ) -> bool {
        let now = Instant::now();

        self.maybe_cleanup(now, window);

        let mut records = self
            .records
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let timestamps = records.entry((guild_id, user_id)).or_insert_with(Vec::new);

        timestamps.retain(|&t| now.saturating_duration_since(t) < window);
        timestamps.push(now);
        timestamps.len() > limit
    }

    /// Checks if a warning should be sent, enforcing a cooldown.
    /// Returns `true` if the cooldown has elapsed (or if no warning has been sent yet),
    /// and updates the warning timestamp.
    pub fn check_warning_cooldown(&self, guild_id: u64, user_id: u64, cooldown: Duration) -> bool {
        let now = Instant::now();
        let mut last_warned = self
            .last_warned
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        if let Some(&last) = last_warned.get(&(guild_id, user_id)) {
            if now.saturating_duration_since(last) < cooldown {
                return false;
            }
        }

        last_warned.insert((guild_id, user_id), now);
        true
    }

    /// Periodically removes empty or expired entries from the maps to free memory
    fn maybe_cleanup(&self, now: Instant, window: Duration) {
        let mut counter = self
            .cleanup_counter
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        *counter += 1;
        // Run cleanup every 100 checks
        if *counter >= 100 {
            *counter = 0;
            if let Ok(mut records) = self.records.lock() {
                records.retain(|_, timestamps| {
                    timestamps.retain(|&t| now.saturating_duration_since(t) < window);
                    !timestamps.is_empty()
                });
            }
            if let Ok(mut last_warned) = self.last_warned.lock() {
                // Keep warning records only if they fall within the window
                last_warned.retain(|_, &mut last| now.saturating_duration_since(last) < window);
            }
        }
    }
}
