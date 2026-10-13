use super::GuildActor;
use crate::features::music::player::{SeekMode, is_live_stream, parse_timestamp};
use anyhow::{Context, Result, bail};
use core::time::Duration;
use tokio::time::{Instant, timeout};

/// Fast path: forward seeks decode-and-discard within the existing stream.
const SEEK_FORWARD_TIMEOUT: Duration = Duration::from_secs(4);
/// Slow path: backward seeks re-create the HTTP stream (yt-dlp + reconnect +
/// re-demux), so they need a much larger budget.
const SEEK_BACKWARD_TIMEOUT: Duration = Duration::from_secs(15);

/// Parses seek inputs with relative signs like "+30", "-15", or absolute "1:30".
fn parse_seek_input(input: &str) -> Option<SeekMode> {
    let trimmed = input.trim();
    if let Some(rest) = trimmed.strip_prefix('+') {
        let dur = parse_timestamp(rest)?;
        Some(SeekMode::RelativeForward(dur))
    } else if let Some(rest) = trimmed.strip_prefix('-') {
        let dur = parse_timestamp(rest)?;
        Some(SeekMode::RelativeBackward(dur))
    } else {
        let dur = parse_timestamp(trimmed)?;
        Some(SeekMode::Absolute(dur))
    }
}

impl GuildActor {
    pub(super) async fn handle_seek(&mut self, input: String) -> Result<Duration> {
        if self.seek_in_flight {
            bail!("A seek is already in progress, please wait.");
        }

        if self.state.current_meta.as_ref().is_some_and(is_live_stream) {
            bail!("Cannot seek in a live stream.");
        }

        if let Some(last_seek) = self.last_seek_at
            && last_seek.elapsed() < Duration::from_millis(400)
        {
            bail!("Seeking too quickly! Please wait a moment between seeks.");
        }

        let handle = self
            .state
            .current
            .as_ref()
            .context("Nothing is currently playing.")?;
        let seek_mode = parse_seek_input(&input).context(
            "Invalid input! Use timestamps like `1:30` or offsets like `+30`, `-15`, `+1:30`.",
        )?;

        self.last_seek_at = Some(Instant::now());

        let estimated_wall_clock = self.state.current_started_at.map_or(0.0, |st| {
            st.elapsed()
                .saturating_sub(self.state.current_paused_total)
                .as_secs_f64()
        });
        let fallback_pos =
            Duration::from_secs_f64(self.last_seek_target_sec + estimated_wall_clock);

        let current_pos = match timeout(Duration::from_millis(500), handle.get_info()).await {
            Ok(Ok(info)) => info.position,
            _ => fallback_pos,
        };

        let mut target = match seek_mode {
            SeekMode::Absolute(dur) => dur,
            SeekMode::RelativeForward(delta) => current_pos + delta,
            SeekMode::RelativeBackward(delta) => current_pos.saturating_sub(delta),
        };

        if let Some(total_duration) = self.state.current_meta.as_ref().and_then(|m| m.duration)
            && target >= total_duration
        {
            target = total_duration.saturating_sub(Duration::from_millis(500));
        }

        self.seek_in_flight = true;
        let is_backward = target < current_pos;
        let seek_timeout = if is_backward {
            SEEK_BACKWARD_TIMEOUT
        } else {
            SEEK_FORWARD_TIMEOUT
        };
        let result = timeout(seek_timeout, handle.seek_async(target)).await;
        self.seek_in_flight = false;

        match result {
            Ok(Ok(_)) => {
                self.last_seek_target_sec = target.as_secs_f64();
                self.state.current_started_at = Some(Instant::now());
                self.state.current_paused_at = None;
                self.state.current_paused_total = Duration::ZERO;
                self.broadcast_state_with_position(target.as_secs_f64())
                    .await;
                Ok(target)
            }
            Ok(Err(e)) => bail!("Seek failed on audio engine: {e:?}"),
            Err(_) if is_backward => bail!(
                "Seek timed out after {}s while re-buffering audio. Backward seeks re-fetch the stream, so they take longer — please try again, or try a smaller jump.",
                seek_timeout.as_secs()
            ),
            Err(_) => bail!(
                "Seek timed out after {}s while waiting for media buffer. Try again.",
                seek_timeout.as_secs()
            ),
        }
    }
}
