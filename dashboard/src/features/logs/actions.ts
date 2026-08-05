"use server";

import * as queries from "./queries";
import type { AutomodLog, JoinLeaveLog, ModerationLog, JoinLeaveAction } from "./types";
import { verifyGuildAccess } from "@/features/_shared/guild";

export async function getAutomodLogsAction(
    guildId: string,
    limit = 20,
    cursorCreatedAt?: string | null,
    cursorId?: string | null
): Promise<AutomodLog[]> {
    try {
        await verifyGuildAccess(guildId);
        return await queries.getAutomodLogs(guildId, limit, cursorCreatedAt, cursorId);
    } catch (error) {
        console.error("Action error fetching automod logs:", error);
        return [];
    }
}

export async function getJoinLeaveLogsAction(
    guildId: string,
    action?: JoinLeaveAction | null,
    limit = 20,
    cursorCreatedAt?: string | null,
    cursorId?: string | null
): Promise<JoinLeaveLog[]> {
    try {
        await verifyGuildAccess(guildId);
        return await queries.getJoinLeaveLogs(guildId, action, limit, cursorCreatedAt, cursorId);
    } catch (error) {
        console.error("Action error fetching join leave logs:", error);
        return [];
    }
}

export async function getModerationLogsAction(
    guildId: string,
    limit = 20,
    cursorCreatedAt?: string | null,
    cursorCaseId?: string | null
): Promise<ModerationLog[]> {
    try {
        await verifyGuildAccess(guildId);
        return await queries.getModerationLogs(guildId, limit, cursorCreatedAt, cursorCaseId);
    } catch (error) {
        console.error("Action error fetching moderation logs:", error);
        return [];
    }
}