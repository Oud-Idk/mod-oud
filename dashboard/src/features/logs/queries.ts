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
    moderator_id: string;
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
        SELECT id::TEXT,
               guild_id,
               user_id,
               channel_id,
               message_id,
               rule_type,
               trigger_content,
               original_content,
               actions_taken,
               created_at
        FROM automod_logs
        WHERE guild_id = $1
          AND (
            $2::TEXT IS NULL OR $3::BIGINT IS NULL OR
            created_at < $2::TIMESTAMPTZ OR
            (created_at = $2::TIMESTAMPTZ AND id < $3::BIGINT)
            )
        ORDER BY created_at DESC, id DESC
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
        SELECT id::TEXT,
               user_id::TEXT,
               guild_id::TEXT,
               action,
               created_at
        FROM join_leave_logs
        WHERE guild_id = $1
          AND ($2::TEXT IS NULL OR action = $2::LOG_ACTION)
          AND (
            $3::TEXT IS NULL OR $4::BIGINT IS NULL OR
            created_at < $3::TIMESTAMPTZ OR
            (created_at = $3::TIMESTAMPTZ AND id < $4::BIGINT)
            )
        ORDER BY created_at DESC, id DESC
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
        SELECT case_id::TEXT,
               guild_id::TEXT,
               target_id::TEXT,
               moderator_id::TEXT,
               action_type,
               reason,
               duration,
               created_at
        FROM moderation_logs
        WHERE guild_id = $1
          AND (
            $2::TEXT IS NULL OR $3::INTEGER IS NULL OR
            created_at < $2::TIMESTAMPTZ OR
            (created_at = $2::TIMESTAMPTZ AND case_id < $3::INTEGER)
            )
        ORDER BY created_at DESC, case_id DESC
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