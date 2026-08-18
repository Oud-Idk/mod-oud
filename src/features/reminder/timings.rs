use chrono::{DateTime, Datelike, Duration, NaiveTime, Timelike, Utc};
use chrono_tz::Tz;

pub struct RecurrenceRule {
    pub days_of_week: Vec<u32>,
    pub time_start: Option<NaiveTime>,
    pub time_end: Option<NaiveTime>,
    pub interval_seconds: Option<i64>,
    pub timezone: Option<Tz>,
}

fn is_time_in_range(current: NaiveTime, start: NaiveTime, end: NaiveTime) -> bool {
    if start <= end {
        current >= start && current < end
    } else {
        // Overnight range wrapping around midnight (e.g. 22:00 to 04:00)
        current >= start || current < end
    }
}

pub fn calculate_next_trigger(now: DateTime<Utc>, rule: &RecurrenceRule) -> DateTime<Utc> {
    // If timezone is provided, do all math in local time then convert back to UTC
    let tz = rule.timezone.unwrap_or(chrono_tz::UTC);
    let local_now = now.with_timezone(&tz);

    let days = &rule.days_of_week;
    let mut target_date = local_now;

    let start = rule
        .time_start
        .unwrap_or_else(|| NaiveTime::from_hms_opt(0, 0, 0).unwrap());
    let end = rule
        .time_end
        .unwrap_or_else(|| NaiveTime::from_hms_opt(23, 59, 59).unwrap());

    for _ in 0..8 {
        let weekday_num = target_date.weekday().num_days_from_sunday();
        let yesterday_weekday = (weekday_num + 6) % 7;

        let is_active_day = days.is_empty() || days.contains(&weekday_num);
        let was_yesterday_active = days.is_empty() || days.contains(&yesterday_weekday);

        let current_time = target_date.time();

        let inside_todays_window = is_active_day
            && is_time_in_range(current_time, start, end)
            && (start <= end || current_time >= start);

        let inside_yesterdays_window =
            was_yesterday_active && (start > end) && (current_time < end);

        if let Some(interval) = rule.interval_seconds {
            if inside_todays_window || inside_yesterdays_window {
                let next_interval = target_date + Duration::seconds(interval);
                let next_time = next_interval.time();
                let days_diff = (next_interval.date_naive() - target_date.date_naive()).num_days();

                let still_in_today = inside_todays_window
                    && is_time_in_range(next_time, start, end)
                    && (days_diff == 0 || (start > end && days_diff == 1));

                let still_in_yesterday =
                    inside_yesterdays_window && next_time < end && days_diff == 0;

                if still_in_today || still_in_yesterday {
                    return next_interval.with_timezone(&Utc);
                }
            }
        }

        if is_active_day && current_time <= start {
            if let Some(candidate) = target_date
                .with_hour(start.hour())
                .and_then(|d| d.with_minute(start.minute()))
                .and_then(|d| d.with_second(start.second()))
                .and_then(|d| d.with_nanosecond(0))
            {
                if candidate > local_now {
                    return candidate.with_timezone(&Utc);
                }
            }
        }

        // Move to the next day at midnight (00:00:00.000)
        target_date = (target_date + Duration::days(1))
            .with_hour(0)
            .unwrap()
            .with_minute(0)
            .unwrap()
            .with_second(0)
            .unwrap()
            .with_nanosecond(0)
            .unwrap();
    }

    now + Duration::days(1)
}
