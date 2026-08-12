import { z } from "zod";
import { db } from "@/lib/db";
import {
    ListenerStat,
    MusicStatsSummary,
    TrackStat,
    listenerStatSchema,
    musicStatsSummarySchema,
    trackStatSchema,
} from "@/features/music-stats/types";

const LOOKBACK_INTERVAL = "30 days";
const TOP_LIMIT = 20;

export async function getMusicStatsSummary(guildId: string): Promise<MusicStatsSummary> {
    const validGuildId = z.string().min(1).parse(guildId);

    const res = await db.query(
        `
            SELECT COUNT(*)::INTEGER                                                  AS "totalPlays",
                   COALESCE(SUM(COALESCE(NULLIF(listened_ms, 0), duration_ms, 0)), 0)::BIGINT AS "totalListenedMs",
                   COUNT(DISTINCT track_url)::INTEGER                                 AS "uniqueTracks",
                   COUNT(DISTINCT user_id)::INTEGER                                   AS "uniqueListeners"
            FROM music_play_events
            WHERE guild_id = $1
              AND played_at >= NOW() - ($2::text)::interval
        `,
        [validGuildId, LOOKBACK_INTERVAL]
    );

    return musicStatsSummarySchema.parse(res.rows[0]);
}

export async function getTopTracks(guildId: string, limit = TOP_LIMIT): Promise<TrackStat[]> {
    const validGuildId = z.string().min(1).parse(guildId);
    const validLimit = z.number().int().positive().max(100).parse(limit);

    const res = await db.query(
        `
            SELECT title,
                   artist,
                   track_url AS "trackUrl",
                   COUNT(*)::INTEGER AS "plays",
                   COALESCE(SUM(COALESCE(NULLIF(listened_ms, 0), duration_ms, 0)), 0)::BIGINT AS "totalListenedMs"
            FROM music_play_events
            WHERE guild_id = $1
              AND played_at >= NOW() - ($2::text)::interval
            GROUP BY title, artist, track_url
            ORDER BY "plays" DESC
            LIMIT $3
        `,
        [validGuildId, LOOKBACK_INTERVAL, validLimit]
    );

    return z.array(trackStatSchema).parse(res.rows);
}

export async function getTopListeners(guildId: string, limit = TOP_LIMIT): Promise<ListenerStat[]> {
    const validGuildId = z.string().min(1).parse(guildId);
    const validLimit = z.number().int().positive().max(100).parse(limit);

    const res = await db.query(
        `
            SELECT user_id::TEXT AS "userId",
                   COUNT(*)::INTEGER AS "plays",
                   COALESCE(SUM(COALESCE(NULLIF(listened_ms, 0), duration_ms, 0)), 0)::BIGINT AS "totalListenedMs"
            FROM music_play_events
            WHERE guild_id = $1
              AND played_at >= NOW() - ($2::text)::interval
            GROUP BY user_id
            ORDER BY "plays" DESC
            LIMIT $3
        `,
        [validGuildId, LOOKBACK_INTERVAL, validLimit]
    );

    return z.array(listenerStatSchema).parse(res.rows);
}