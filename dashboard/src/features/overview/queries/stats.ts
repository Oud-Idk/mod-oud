import { db } from "@/lib/db";
import { RawWeeklyStats, RawWeeklyStatsSchema, StatCardItem } from "../types";

export const STATS_WINDOW_DAYS = 7;

function signed(n: number): string {
    return n > 0 ? `+${n.toLocaleString()}` : n.toLocaleString();
}

export function formatDelta(current: number, previous: number): string {
    const diff = current - previous;
    if (diff === 0) return `No change vs prior ${STATS_WINDOW_DAYS.toString()}d`;
    return `${signed(diff)} vs prior ${STATS_WINDOW_DAYS.toString()}d`;
}

export function buildStatCards(raw: RawWeeklyStats): StatCardItem[] {
    const netCurrent = raw.joins_current - raw.leaves_current;
    const netPrevious = raw.joins_previous - raw.leaves_previous;

    return [
        {
            id: "member_growth",
            title: "Net Member Growth",
            value: signed(netCurrent),
            delta: formatDelta(netCurrent, netPrevious),
        },
        {
            id: "moderation",
            title: "Moderation Actions",
            value: raw.moderation_current.toLocaleString(),
            delta: formatDelta(raw.moderation_current, raw.moderation_previous),
        },
        {
            id: "automod",
            title: "AutoMod Triggers",
            value: raw.automod_current.toLocaleString(),
            delta: formatDelta(raw.automod_current, raw.automod_previous),
        },
        {
            id: "tickets",
            title: "Tickets Opened",
            value: raw.tickets_current.toLocaleString(),
            delta: formatDelta(raw.tickets_current, raw.tickets_previous),
        },
    ];
}

/** Rolling windows: `current` is the last 7 days, `previous` the 7 days before that. */
export async function getWeeklyStats(guildId: string): Promise<StatCardItem[] | null> {
    try {
        const result = await db.query(
            `WITH b AS (
                SELECT NOW() - make_interval(days => $2::int)     AS cur_start,
                       NOW() - make_interval(days => 2 * $2::int) AS prev_start
             )
             SELECT jl.*, m.*, a.*, t.*
             FROM b
             CROSS JOIN LATERAL (
                SELECT COUNT(*) FILTER (WHERE action = 'JOIN' AND created_at >= b.cur_start)  AS joins_current,
                       COUNT(*) FILTER (WHERE action = 'JOIN' AND created_at < b.cur_start)   AS joins_previous,
                       COUNT(*) FILTER (WHERE action = 'LEAVE' AND created_at >= b.cur_start) AS leaves_current,
                       COUNT(*) FILTER (WHERE action = 'LEAVE' AND created_at < b.cur_start)  AS leaves_previous
                FROM join_leave_logs
                WHERE guild_id = $1 AND created_at >= b.prev_start
             ) jl
             CROSS JOIN LATERAL (
                SELECT COUNT(*) FILTER (WHERE created_at >= b.cur_start) AS moderation_current,
                       COUNT(*) FILTER (WHERE created_at < b.cur_start)  AS moderation_previous
                FROM moderation_logs
                WHERE guild_id = $1 AND created_at >= b.prev_start
             ) m
             CROSS JOIN LATERAL (
                SELECT COUNT(*) FILTER (WHERE created_at >= b.cur_start) AS automod_current,
                       COUNT(*) FILTER (WHERE created_at < b.cur_start)  AS automod_previous
                FROM automod_logs
                WHERE guild_id = $1 AND created_at >= b.prev_start
             ) a
             CROSS JOIN LATERAL (
                SELECT COUNT(*) FILTER (WHERE created_at >= b.cur_start) AS tickets_current,
                       COUNT(*) FILTER (WHERE created_at < b.cur_start)  AS tickets_previous
                FROM tickets
                WHERE guild_id = $1 AND created_at >= b.prev_start
             ) t`,
            [guildId, STATS_WINDOW_DAYS]
        );

        const parsed = RawWeeklyStatsSchema.safeParse(result.rows[0]);
        if (!parsed.success) {
            console.error("Failed to parse weekly stats row:", parsed.error);
            return null;
        }

        return buildStatCards(parsed.data);
    } catch (error) {
        console.error("Failed to fetch weekly stats:", error);
        return null;
    }
}
