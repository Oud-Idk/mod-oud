interface TimeOfDay {
    h: number;
    m: number;
    s: number;
}

interface TriggerRule {
    daysOfWeek: number[] | null;
    timeStart: string | null;
    timeEnd: string | null;
    intervalSeconds: number | null;
}

interface DayWindow {
    date: Date;
    isActiveDay: boolean;
    wasYesterdayActive: boolean;
    curSec: number;
    startSec: number;
    endSec: number;
    insideTodaysWindow: boolean;
    insideYesterdaysWindow: boolean;
}

function parseTime(timeStr: string | null, fallback: TimeOfDay): TimeOfDay {
    if (timeStr === null) return fallback;
    const parts = timeStr.split(":").map(Number);
    return {
        h: parts[0] ?? 0,
        m: parts[1] ?? 0,
        s: parts[2] ?? 0,
    };
}

function timeToSeconds(time: TimeOfDay): number {
    return time.h * 3600 + time.m * 60 + time.s;
}

function isTimeInRange(cur: TimeOfDay, start: TimeOfDay, end: TimeOfDay): boolean {
    const curSec = timeToSeconds(cur);
    const startSec = timeToSeconds(start);
    const endSec = timeToSeconds(end);

    if (startSec <= endSec) {
        return curSec >= startSec && curSec < endSec;
    } else {
        return curSec >= startSec || curSec < endSec;
    }
}

function describeDayWindow(date: Date, days: number[], start: TimeOfDay, end: TimeOfDay): DayWindow {
    const weekdayNum = date.getUTCDay();
    const yesterdayWeekday = (weekdayNum + 6) % 7;

    const isActiveDay = days.length === 0 || days.includes(weekdayNum);
    const wasYesterdayActive = days.length === 0 || days.includes(yesterdayWeekday);

    const cur = {
        h: date.getUTCHours(),
        m: date.getUTCMinutes(),
        s: date.getUTCSeconds(),
    };

    const startSec = timeToSeconds(start);
    const endSec = timeToSeconds(end);
    const curSec = timeToSeconds(cur);

    const insideTodaysWindow =
        isActiveDay &&
        isTimeInRange(cur, start, end) &&
        (startSec <= endSec || curSec >= startSec);
    const insideYesterdaysWindow =
        wasYesterdayActive && startSec > endSec && curSec < endSec;

    return {
        date,
        isActiveDay,
        wasYesterdayActive,
        curSec,
        startSec,
        endSec,
        insideTodaysWindow,
        insideYesterdaysWindow,
    };
}

function nextIntervalWithinWindow(
    day: DayWindow,
    start: TimeOfDay,
    end: TimeOfDay,
    intervalSeconds: number
): Date | null {
    const nextInterval = new Date(day.date.getTime() + intervalSeconds * 1000);
    const next = {
        h: nextInterval.getUTCHours(),
        m: nextInterval.getUTCMinutes(),
        s: nextInterval.getUTCSeconds(),
    };

    const targetDayStart = new Date(day.date).setUTCHours(0, 0, 0, 0);
    const nextDayStart = new Date(nextInterval).setUTCHours(0, 0, 0, 0);
    const daysDiff = Math.round((nextDayStart - targetDayStart) / (1000 * 60 * 60 * 24));

    const stillInToday =
        day.insideTodaysWindow &&
        isTimeInRange(next, start, end) &&
        (daysDiff === 0 || (day.startSec > day.endSec && daysDiff === 1));

    const stillInYesterday =
        day.insideYesterdaysWindow &&
        timeToSeconds(next) < day.endSec &&
        daysDiff === 0;

    if (stillInToday || stillInYesterday) {
        return nextInterval;
    }
    return null;
}

function startTimeCandidate(day: DayWindow, now: Date, start: TimeOfDay): Date | null {
    if (day.isActiveDay && day.curSec <= day.startSec) {
        const candidate = new Date(day.date.getTime());
        candidate.setUTCHours(start.h, start.m, start.s, 0);
        if (candidate > now) {
            return candidate;
        }
    }
    return null;
}

export function calculateNextTriggerJS(now: Date, rule: TriggerRule): Date {
    const days = rule.daysOfWeek ?? [];
    const start = parseTime(rule.timeStart, { h: 0, m: 0, s: 0 });
    const end = parseTime(rule.timeEnd, { h: 23, m: 59, s: 59 });

    let targetDate = new Date(now.getTime());

    for (let i = 0; i < 8; i++) {
        const day = describeDayWindow(targetDate, days, start, end);

        if ((day.insideTodaysWindow || day.insideYesterdaysWindow) && rule.intervalSeconds !== null) {
            const nextInterval = nextIntervalWithinWindow(day, start, end, rule.intervalSeconds);
            if (nextInterval) {
                return nextInterval;
            }
        }

        const candidate = startTimeCandidate(day, now, start);
        if (candidate) {
            return candidate;
        }

        targetDate = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000);
        targetDate.setUTCHours(0, 0, 0, 0);
    }

    return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}