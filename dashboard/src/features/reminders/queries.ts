import { db } from "@/lib/db";
import redis from "@/lib/redis";
import { type ReminderRow, reminderRowSchema, type SaveableReminderInput, saveableReminderSchema, } from "./types";

function calculateNextTriggerJS(
    now: Date,
    rule: {
        daysOfWeek: number[] | null;
        timeStart: string | null;
        timeEnd: string | null;
        intervalSeconds: number | null;
    }
): Date {
    const days = rule.daysOfWeek || [];
    let targetDate = new Date(now.getTime());

    const parseTime = (
        timeStr: string | null,
        fallback: { h: number; m: number; s: number }
    ): { h: number; m: number; s: number } => {
        if (!timeStr) return fallback;
        const parts = timeStr.split(":").map(Number);
        return {
            h: parts[0] ?? fallback.h,
            m: parts[1] ?? fallback.m,
            s: parts[2] ?? fallback.s,
        };
    };

    const start = parseTime(rule.timeStart, { h: 0, m: 0, s: 0 });
    const end = parseTime(rule.timeEnd, { h: 23, m: 59, s: 59 });

    const isTimeInRange = (curH: number, curM: number, curS: number): boolean => {
        const curSec = curH * 3600 + curM * 60 + curS;
        const startSec = start.h * 3600 + start.m * 60 + start.s;
        const endSec = end.h * 3600 + end.m * 60 + end.s;

        if (startSec <= endSec) {
            return curSec >= startSec && curSec < endSec;
        } else {
            return curSec >= startSec || curSec < endSec;
        }
    };

    for (let i = 0; i < 8; i++) {
        const weekdayNum = targetDate.getUTCDay();
        const yesterdayWeekday = (weekdayNum + 6) % 7;

        const isActiveDay = days.length === 0 || days.includes(weekdayNum);
        const wasYesterdayActive = days.length === 0 || days.includes(yesterdayWeekday);

        const curH = targetDate.getUTCHours();
        const curM = targetDate.getUTCMinutes();
        const curS = targetDate.getUTCSeconds();

        const startSec = start.h * 3600 + start.m * 60 + start.s;
        const endSec = end.h * 3600 + end.m * 60 + end.s;
        const curSec = curH * 3600 + curM * 60 + curS;

        const insideTodaysWindow =
            isActiveDay &&
            isTimeInRange(curH, curM, curS) &&
            (startSec <= endSec || curSec >= startSec);
        const insideYesterdaysWindow =
            wasYesterdayActive && startSec > endSec && curSec < endSec;

        if (insideTodaysWindow || insideYesterdaysWindow) {
            if (rule.intervalSeconds) {
                const nextInterval = new Date(targetDate.getTime() + rule.intervalSeconds * 1000);
                const nextH = nextInterval.getUTCHours();
                const nextM = nextInterval.getUTCMinutes();
                const nextS = nextInterval.getUTCSeconds();

                const targetDayStart = new Date(targetDate).setUTCHours(0, 0, 0, 0);
                const nextDayStart = new Date(nextInterval).setUTCHours(0, 0, 0, 0);
                const daysDiff = Math.round((nextDayStart - targetDayStart) / (1000 * 60 * 60 * 24));

                const stillInToday =
                    insideTodaysWindow &&
                    isTimeInRange(nextH, nextM, nextS) &&
                    (daysDiff === 0 || (startSec > endSec && daysDiff === 1));

                const stillInYesterday =
                    insideYesterdaysWindow &&
                    nextH * 3600 + nextM * 60 + nextS < endSec &&
                    daysDiff === 0;

                if (stillInToday || stillInYesterday) {
                    return nextInterval;
                }
            }
        }

        if (isActiveDay && curSec <= startSec) {
            const candidate = new Date(targetDate.getTime());
            candidate.setUTCHours(start.h, start.m, start.s, 0);
            if (candidate > now) {
                return candidate;
            }
        }

        targetDate = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000);
        targetDate.setUTCHours(0, 0, 0, 0);
    }

    return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}

async function invalidateChannelReminderCache(channelId: string | null | undefined): Promise<void> {
    if (!channelId) return;
    const cacheKey = `reminders:channel:${channelId}`;
    try {
        await redis.del(cacheKey);
        await redis.publish("reminder_updates", `invalidate:${channelId}`);
    } catch (redisError) {
        console.error(`Failed to clear cache for channel ${channelId}:`, redisError);
    }
}

export async function getRemindersByChannels(channelIds: string[]): Promise<ReminderRow[]> {
    if (channelIds.length === 0) return [];

    const query = `
        SELECT id::TEXT,
               channel_id       AS "channelId",
               message,
               r_type           AS "rType",
               next_trigger_at  AS "nextTriggerAt",
               days_of_week     AS "daysOfWeek",
               time_start       AS "timeStart",
               time_end         AS "timeEnd",
               interval_seconds AS "intervalSeconds",
               is_active        AS "isActive"
        FROM reminders
        WHERE channel_id = ANY ($1::BIGINT[])
        ORDER BY next_trigger_at ASC
    `;

    const res = await db.query(query, [channelIds]);
    return res.rows.map((row) =>
        reminderRowSchema.parse({
            id: row.id,
            channelId: row.channelId,
            rType: row.rType,
            nextTriggerAt: row.nextTriggerAt,
            daysOfWeek: row.daysOfWeek,
            timeStart: row.timeStart,
            timeEnd: row.timeEnd,
            intervalSeconds: row.intervalSeconds,
            isActive: row.isActive,
            message: row.message,
        })
    );
}

export async function saveReminder(
    rawReminder: SaveableReminderInput
): Promise<ReminderRow> {
    const reminder = saveableReminderSchema.parse(rawReminder);
    const isEdit = Boolean(reminder.id);

    let finalNextTrigger = reminder.nextTriggerAt;
    if (reminder.rType === "RECURRING") {
        finalNextTrigger = calculateNextTriggerJS(new Date(), {
            daysOfWeek: reminder.daysOfWeek,
            timeStart: reminder.timeStart,
            timeEnd: reminder.timeEnd,
            intervalSeconds: reminder.intervalSeconds,
        });
    }

    let query: string;
    let params: unknown[];

    if (isEdit) {
        query = `
            UPDATE reminders
            SET channel_id       = $2,
                message          = $3,
                r_type           = $4,
                next_trigger_at  = $5,
                days_of_week     = $6,
                time_start       = $7,
                time_end         = $8,
                interval_seconds = $9,
                is_active        = $10
            WHERE id = $1
            RETURNING
                id::TEXT,
                channel_id AS "channelId",
                r_type AS "rType",
                next_trigger_at AS "nextTriggerAt",
                days_of_week AS "daysOfWeek",
                time_start AS "timeStart",
                time_end AS "timeEnd",
                interval_seconds AS "intervalSeconds",
                is_active AS "isActive"
        `;
        params = [
            reminder.id ?? null,
            reminder.channelId,
            reminder.message,
            reminder.rType,
            finalNextTrigger,
            reminder.daysOfWeek,
            reminder.timeStart,
            reminder.timeEnd,
            reminder.intervalSeconds,
            reminder.isActive,
        ];
    } else {
        query = `
            INSERT INTO reminders (
                channel_id, message, r_type, next_trigger_at,
                days_of_week, time_start, time_end, interval_seconds, is_active
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING
                id::TEXT,
                channel_id AS "channelId",
                r_type AS "rType",
                next_trigger_at AS "nextTriggerAt",
                days_of_week AS "daysOfWeek",
                time_start AS "timeStart",
                time_end AS "timeEnd",
                interval_seconds AS "intervalSeconds",
                is_active AS "isActive"
        `;
        params = [
            reminder.channelId,
            reminder.message,
            reminder.rType,
            finalNextTrigger,
            reminder.daysOfWeek,
            reminder.timeStart,
            reminder.timeEnd,
            reminder.intervalSeconds,
            reminder.isActive,
        ];
    }

    const res = await db.query(query, params);
    await invalidateChannelReminderCache(reminder.channelId);

    const row = res.rows[0];
    return reminderRowSchema.parse({
        id: row.id,
        channelId: row.channelId,
        rType: row.rType,
        nextTriggerAt: row.nextTriggerAt,
        daysOfWeek: row.daysOfWeek,
        timeStart: row.timeStart,
        timeEnd: row.timeEnd,
        intervalSeconds: row.intervalSeconds,
        isActive: row.isActive,
        message: row.message,
    });
}
export async function deleteReminder(id: string, channelId: string | null): Promise<void> {
    const query = `DELETE FROM reminders WHERE id = $1`;
    await db.query(query, [id]);
    await invalidateChannelReminderCache(channelId);
}