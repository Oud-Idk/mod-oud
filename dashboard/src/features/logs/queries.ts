import { z } from "zod";
import { db } from "@/lib/db";
import {
    automodLogSchema,
    joinLeaveLogSchema,
    moderationLogSchema,
    getLogsInputSchema,
    joinLeaveActionSchema,
    type AutomodLog,
    type JoinLeaveLog,
    type ModerationLog,
    type JoinLeaveAction,
} from "./types";

interface PgInterval {
    years?: number;
    months?: number;
    days?: number;
    hours?: number;
    minutes?: number;
    seconds?: number;
}

interface RawModerationLog {
    case_id: string | number;
    guild_id: string;
    target_id: string | null;
    target_username: string | null;
    moderator_id: string;
    moderator_username: string | null;
    action_type: string;
    reason: string | null;
    duration: PgInterval | null;
    created_at: string | Date;
}

function formatDuration(duration: PgInterval | null): string | null {
    if (duration === null) return null;
    const parts: string[] = [];

    if (duration.years !== undefined && duration.years > 0) {
        parts.push(`${String(duration.years)}y`);
    }
    if (duration.months !== undefined && duration.months > 0) {
        parts.push(`${String(duration.months)}mo`);
    }
    if (duration.days !== undefined && duration.days > 0) {
        parts.push(`${String(duration.days)}d`);
    }
    if (duration.hours !== undefined && duration.hours > 0) {
        parts.push(`${String(duration.hours)}h`);
    }
    if (duration.minutes !== undefined && duration.minutes > 0) {
        parts.push(`${String(duration.minutes)}m`);
    }
    if (duration.seconds !== undefined && duration.seconds > 0) {
        parts.push(`${String(duration.seconds)}s`);
    }

    return parts.length > 0 ? parts.join(" ") : null;
}

export async function getAutomodLogs(
    guildId: string,
    limit = 20,
    cursorCreatedAt?: string | null,
    cursorId?: string | null
): Promise<AutomodLog[]> {
    const params = getLogsInputSchema.parse({
        guildId,
        limit,
        cursorCreatedAt,
        cursorId,
    });

    const query = `
        SELECT a.id::TEXT,
               a.guild_id,
               a.user_id,
               COALESCE(u.username, '') AS username,
               a.channel_id,
               a.message_id,
               a.rule_type,
               a.trigger_content,
               a.original_content,
               a.actions_taken,
               a.created_at
        FROM automod_logs a
        LEFT JOIN discord_users u ON u.user_id = a.user_id
        WHERE a.guild_id = $1
          AND (
            $2::TEXT IS NULL OR $3::BIGINT IS NULL OR
            a.created_at < $2::TIMESTAMPTZ OR
            (a.created_at = $2::TIMESTAMPTZ AND a.id < $3::BIGINT)
            )
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT $4;
    `;

    const result = await db.query(query, [
        params.guildId,
        params.cursorCreatedAt,
        params.cursorId,
        params.limit,
    ]);

    return z.array(automodLogSchema).parse(result.rows);
}

export async function getJoinLeaveLogs(
    guildId: string,
    action?: JoinLeaveAction | null,
    limit = 20,
    cursorCreatedAt?: string | null,
    cursorId?: string | null
): Promise<JoinLeaveLog[]> {
    const params = getLogsInputSchema.parse({
        guildId,
        limit,
        cursorCreatedAt,
        cursorId,
    });

    const validAction =
        action !== undefined && action !== null ? joinLeaveActionSchema.parse(action) : null;

    const query = `
        SELECT j.id::TEXT,
               j.user_id::TEXT,
               COALESCE(u.username, '') AS username,
               j.guild_id::TEXT,
               j.action,
               j.created_at
        FROM join_leave_logs j
        LEFT JOIN discord_users u ON u.user_id = j.user_id
        WHERE j.guild_id = $1
          AND ($2::TEXT IS NULL OR j.action = $2::LOG_ACTION)
          AND (
            $3::TEXT IS NULL OR $4::BIGINT IS NULL OR
            j.created_at < $3::TIMESTAMPTZ OR
            (j.created_at = $3::TIMESTAMPTZ AND j.id < $4::BIGINT)
            )
        ORDER BY j.created_at DESC, j.id DESC
        LIMIT $5;
    `;

    const result = await db.query(query, [
        params.guildId,
        validAction,
        params.cursorCreatedAt,
        params.cursorId,
        params.limit,
    ]);

    return z.array(joinLeaveLogSchema).parse(result.rows);
}

export async function getModerationLogs(
    guildId: string,
    limit = 20,
    cursorCreatedAt?: string | null,
    cursorCaseId?: string | null
): Promise<ModerationLog[]> {
    const params = getLogsInputSchema.parse({
        guildId,
        limit,
        cursorCreatedAt,
        cursorId: cursorCaseId,
    });

    const query = `
        SELECT m.case_id::TEXT,
               m.guild_id::TEXT,
               m.target_id::TEXT,
               COALESCE(t.username, '') AS target_username,
               m.moderator_id::TEXT,
               COALESCE(mo.username, '') AS moderator_username,
               m.action_type,
               m.reason,
               m.duration,
               m.created_at
        FROM moderation_logs m
        LEFT JOIN discord_users t ON t.user_id = m.target_id
        LEFT JOIN discord_users mo ON mo.user_id = m.moderator_id
        WHERE m.guild_id = $1
          AND (
            $2::TEXT IS NULL OR $3::INTEGER IS NULL OR
            m.created_at < $2::TIMESTAMPTZ OR
            (m.created_at = $2::TIMESTAMPTZ AND m.case_id < $3::INTEGER)
            )
        ORDER BY m.created_at DESC, m.case_id DESC
        LIMIT $4;
    `;

    const result = await db.query<RawModerationLog>(query, [
        params.guildId,
        params.cursorCreatedAt,
        params.cursorId,
        params.limit,
    ]);

    const formattedRows = result.rows.map((row) => ({
        ...row,
        duration: formatDuration(row.duration),
        created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    }));

    return z.array(moderationLogSchema).parse(formattedRows);
}