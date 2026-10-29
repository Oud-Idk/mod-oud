import { z } from "zod";
import { db } from "@/lib/db";
import {
    AutomodBreakdownItem,
    MemberFlowPoint,
    ModerationActivityPoint,
    ModerationSeries,
    RawAutomodBreakdownRowSchema,
    RawMemberFlowRowSchema,
    RawModerationActivityRow,
    RawModerationActivityRowSchema,
} from "./types";

// One row per UTC day, oldest first, ending today. Shared by the per-day queries so they
// zero-fill identically; $2 is the window length in days.
const DAY_SERIES = `
    WITH days AS (
        SELECT generate_series(
            (NOW() AT TIME ZONE 'UTC')::date - ($2::int - 1),
            (NOW() AT TIME ZONE 'UTC')::date,
            INTERVAL '1 day'
        )::date AS day
    )
`;

// Range bounds rather than a cast on created_at, so the (guild_id, created_at) index applies.
const IN_DAY = (alias: string): string => `
    ${alias}.created_at >= d.day AT TIME ZONE 'UTC'
    AND ${alias}.created_at < (d.day + 1) AT TIME ZONE 'UTC'
`;

const ACTION_SERIES: Record<string, ModerationSeries> = {
    BAN: "bans",
    SOFTBAN: "bans",
    KICK: "kicks",
    MUTE: "mutes",
    WARN: "warns",
};

export function seriesForAction(actionType: string): ModerationSeries {
    return ACTION_SERIES[actionType.toUpperCase()] ?? "other";
}

/** Folds (day, action_type) rows into one point per day. Expects rows ordered by day. */
export function pivotModerationRows(rows: RawModerationActivityRow[]): ModerationActivityPoint[] {
    const byDay = new Map<string, ModerationActivityPoint>();

    for (const row of rows) {
        let point = byDay.get(row.day);
        if (point === undefined) {
            point = { day: row.day, bans: 0, kicks: 0, mutes: 0, warns: 0, other: 0 };
            byDay.set(row.day, point);
        }
        if (row.action_type !== null) {
            point[seriesForAction(row.action_type)] += row.count;
        }
    }

    return [...byDay.values()];
}

function parseRows<T extends z.ZodType>(schema: T, rows: unknown[], label: string): z.infer<T>[] | null {
    const parsed = z.array(schema).safeParse(rows);
    if (!parsed.success) {
        console.error(`Failed to parse ${label} rows:`, parsed.error);
        return null;
    }
    return parsed.data;
}

export async function getMemberFlow(guildId: string, days: number): Promise<MemberFlowPoint[]> {
    try {
        const result = await db.query(
            `${DAY_SERIES}
             SELECT to_char(d.day, 'YYYY-MM-DD')               AS day,
                    COUNT(*) FILTER (WHERE l.action = 'JOIN')  AS joins,
                    COUNT(*) FILTER (WHERE l.action = 'LEAVE') AS leaves
             FROM days d
             LEFT JOIN join_leave_logs l
                    ON l.guild_id = $1 AND ${IN_DAY("l")}
             GROUP BY d.day
             ORDER BY d.day`,
            [guildId, days]
        );

        return parseRows(RawMemberFlowRowSchema, result.rows, "member flow") ?? [];
    } catch (error) {
        console.error("Failed to fetch member flow:", error);
        return [];
    }
}

export async function getModerationActivity(guildId: string, days: number): Promise<ModerationActivityPoint[]> {
    try {
        const result = await db.query(
            `${DAY_SERIES}
             SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
                    m.action_type,
                    COUNT(m.case_id)             AS count
             FROM days d
             LEFT JOIN moderation_logs m
                    ON m.guild_id = $1 AND ${IN_DAY("m")}
             GROUP BY d.day, m.action_type
             ORDER BY d.day`,
            [guildId, days]
        );

        const rows = parseRows(RawModerationActivityRowSchema, result.rows, "moderation activity");
        return rows === null ? [] : pivotModerationRows(rows);
    } catch (error) {
        console.error("Failed to fetch moderation activity:", error);
        return [];
    }
}

export async function getAutomodBreakdown(
    guildId: string,
    days: number,
    limit = 8
): Promise<AutomodBreakdownItem[]> {
    try {
        const result = await db.query(
            `SELECT rule_type, COUNT(*) AS count
             FROM automod_logs
             WHERE guild_id = $1
               AND created_at >= ((NOW() AT TIME ZONE 'UTC')::date - ($2::int - 1)) AT TIME ZONE 'UTC'
             GROUP BY rule_type
             ORDER BY count DESC, rule_type
             LIMIT $3`,
            [guildId, days, limit]
        );

        const rows = parseRows(RawAutomodBreakdownRowSchema, result.rows, "automod breakdown");
        return rows === null ? [] : rows.map((row) => ({ rule: row.rule_type, count: row.count }));
    } catch (error) {
        console.error("Failed to fetch automod breakdown:", error);
        return [];
    }
}
