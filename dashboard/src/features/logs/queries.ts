import { db } from "@/lib/db";
import {
    automodLogSchema,
    joinLeaveLogSchema,
    moderationLogSchema,
    type AutomodLog,
    type JoinLeaveLog,
    type ModerationLog,
    type JoinLeaveAction,
} from "./types";

// ==========================================
// 🔒 LOCAL DATABASE INTERFACES & HELPERS
// ==========================================

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
    if (!duration) return null;
    const parts: string[] = [];
    if (duration.years) parts.push(`${duration.years}y`);
    if (duration.months) parts.push(`${duration.months}mo`);
    if (duration.days) parts.push(`${duration.days}d`);
    if (duration.hours) parts.push(`${duration.hours}h`);
    if (duration.minutes) parts.push(`${duration.minutes}m`);
    if (duration.seconds) parts.push(`${duration.seconds}s`);
    return parts.length > 0 ? parts.join(" ") : null;
}

export async function getAutomodLogs(
    guildId: string,
    limit = 20,
    cursorCreatedAt?: string | null,
    cursorId?: string | null
): Promise<AutomodLog[]> {
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
        guildId,
        cursorCreatedAt || null,
        cursorId || null,
        limit,
    ]);

    return result.rows.map((row) => automodLogSchema.parse(row));
}

export async function getJoinLeaveLogs(
    guildId: string,
    action?: JoinLeaveAction | null,
    limit = 20,
    cursorCreatedAt?: string | null,
    cursorId?: string | null
): Promise<JoinLeaveLog[]> {
    const query = `
        SELECT id::TEXT,
               user_id::TEXT,
               guild_id::TEXT,
               action,
               created_at
        FROM join_leave_logs
        WHERE guild_id = $1
          AND ($2::TEXT IS NULL OR action = $2::LOG_ACTION) -- ✨ The magic fix is right here! ✨
          AND (
            $3::TEXT IS NULL OR $4::BIGINT IS NULL OR
            created_at < $3::TIMESTAMPTZ OR
            (created_at = $3::TIMESTAMPTZ AND id < $4::BIGINT)
            )
        ORDER BY created_at DESC, id DESC
        LIMIT $5;
    `;

    const result = await db.query(query, [
        guildId,
        action || null,
        cursorCreatedAt || null,
        cursorId || null,
        limit,
    ]);

    return result.rows.map((row) => joinLeaveLogSchema.parse(row));
}

export async function getModerationLogs(
    guildId: string,
    limit = 20,
    cursorCreatedAt?: string | null,
    cursorCaseId?: string | null
): Promise<ModerationLog[]> {
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
        guildId,
        cursorCreatedAt || null,
        cursorCaseId || null,
        limit,
    ]);

    return result.rows.map((row) => {
        return moderationLogSchema.parse({
            ...row,
            duration: formatDuration(row.duration),
            created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
        });
    });
}