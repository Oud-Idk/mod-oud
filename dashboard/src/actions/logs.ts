"use server";

import { db } from "@/utils/init/db";
import { verifyGuildAccess } from "@/actions/config";

export interface AutomodLog {
    id: string;
    guild_id: string;
    user_id: string;
    channel_id: string | null;
    message_id: string | null;
    rule_type: string;
    trigger_content: string | null;
    original_content: string | null;
    actions_taken: string[];
    created_at: string;
}

export interface JoinLeaveLog {
    id: string;
    user_id: string;
    guild_id: string;
    action: "JOIN" | "LEAVE";
    created_at: string;
}

// Add this interface to app/actions/logs.ts
export interface ModerationLog {
    case_id: string; // Cast to string to stay safe
    guild_id: string;
    target_id?: string;
    target_username?: string;
    moderator_id: string;
    moderator_username: string;
    action_type: string;
    reason: string | null;
    duration: string | null;
    created_at: string;
}

export async function getAutomodLogs(
    guildId: string,
    limit: number = 20,
    cursorCreatedAt?: string | null,
    cursorId?: string | null
): Promise<AutomodLog[]> {
    try {
        await verifyGuildAccess(guildId);

        const query = `
            SELECT id::TEXT, -- Cast BIGINT to text to prevent precision loss in JS
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
              -- Compound cursor comparison for robust pagination
              AND (
                $2::TEXT IS NULL OR $3::BIGINT IS NULL OR
                created_at < $2::TIMESTAMPTZ OR
                (created_at = $2::TIMESTAMPTZ AND id < $3::BIGINT)
                )
            ORDER BY created_at DESC, id DESC
            LIMIT $4;
        `;

        // Node-postgres maps string parameters containing ISO dates into timestamps cleanly
        const result = await db.query(query, [
            guildId,
            cursorCreatedAt || null,
            cursorId || null,
            limit
        ]);

        return result.rows;
    } catch (error) {
        console.error("Failed to query automod_logs from the database:", error);
        return [];
    }
}

export async function getJoinLeaveLogs(
    guildId: string,
    action?: "JOIN" | "LEAVE" | null,
    limit: number = 20,
    cursorCreatedAt?: string | null,
    cursorId?: string | null
): Promise<JoinLeaveLog[]> {
    try {
        await verifyGuildAccess(guildId);

        const query = `
            SELECT id::TEXT,
                   user_id::TEXT, -- Cast to prevent JS numeric precision loss
                   guild_id::TEXT,
                   action,
                   created_at
            FROM join_leave_logs
            WHERE guild_id = $1
              AND ($2::TEXT IS NULL OR action = $2)
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
            limit
        ]);

        return result.rows;
    } catch (error) {
        console.error("Failed to query join_leave_logs:", error);
        return [];
    }
}

export async function getModerationLogs(
    guildId: string,
    limit: number = 20,
    cursorCreatedAt?: string | null,
    cursorCaseId?: string | null
): Promise<ModerationLog[]> {
    try {
        await verifyGuildAccess(guildId);

        const query = `
            SELECT case_id::TEXT,
                   guild_id::TEXT,
                   target_id::TEXT,
                   moderator_id::TEXT,
                   action_type,
                   reason,
                   duration,
                   created_at,
                   moderator_username,
                   target_username
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

        const result = await db.query(query, [
            guildId,
            cursorCreatedAt || null,
            cursorCaseId || null,
            limit
        ]);

        return result.rows.map(row => {
            let durationStr: string | null = null;

            if (row.duration) {
                const parts: string[] = [];
                if (row.duration.years) parts.push(`${row.duration.years}y`);
                if (row.duration.months) parts.push(`${row.duration.months}mo`);
                if (row.duration.days) parts.push(`${row.duration.days}d`);
                if (row.duration.hours) parts.push(`${row.duration.hours}h`);
                if (row.duration.minutes) parts.push(`${row.duration.minutes}m`);
                if (row.duration.seconds) parts.push(`${row.duration.seconds}s`);
                durationStr = parts.length > 0 ? parts.join(" ") : null;
            }

            return {
                ...row,
                duration: durationStr,
                created_at: row.created_at instanceof Date
                    ? row.created_at.toISOString()
                    : String(row.created_at)
            };
        });
    } catch (error) {
        console.error("Failed to query moderation_logs:", error);
        return [];
    }
}