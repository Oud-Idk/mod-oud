"use server";

import { z } from "zod";
import * as queries from "./queries";
import type { AutomodLog, JoinLeaveLog, ModerationLog, JoinLeaveAction } from "./types";
import { verifyGuildAccess } from "@/features/_shared/guild";

export async function getAutomodLogsAction(
    guildId: string,
    limit = 20,
    cursorCreatedAt?: string | null,
    cursorId?: string | null
): Promise<AutomodLog[]> {
    await verifyGuildAccess(guildId);

    try {
        const validGuildId = z.string().min(1).parse(guildId);
        return await queries.getAutomodLogs(validGuildId, limit, cursorCreatedAt, cursorId);
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
    await verifyGuildAccess(guildId);

    try {
        const validGuildId = z.string().min(1).parse(guildId);
        return await queries.getJoinLeaveLogs(validGuildId, action, limit, cursorCreatedAt, cursorId);
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
    await verifyGuildAccess(guildId);

    try {
        const validGuildId = z.string().min(1).parse(guildId);
        return await queries.getModerationLogs(validGuildId, limit, cursorCreatedAt, cursorCaseId);
    } catch (error) {
        console.error("Action error fetching moderation logs:", error);
        return [];
    }
}