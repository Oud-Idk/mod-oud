"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { reportConfigSchema, type ReportAction, type ReportedMessage } from "./types";
import {
    banUserCommand,
    deleteReportedMessageCommand,
    getInitialReportsFromDb,
    getMoreReportsFromDb,
    resolveReportStatusCommand,
    saveReportConfig,
    timeoutUserCommand,
    warnUserCommand,
} from "./queries";

export async function fetchInitialReportsAction(guildId: string): Promise<ReportedMessage[]> {
    try {
        await verifyGuildAccess(guildId);
        return await getInitialReportsFromDb(guildId);
    } catch (error) {
        console.error("Failed to fetch initial reports:", error);
        return [];
    }
}

export async function fetchMoreReportsAction(guildId: string, beforeId: number): Promise<ReportedMessage[]> {
    try {
        await verifyGuildAccess(guildId);
        return await getMoreReportsFromDb(guildId, beforeId);
    } catch (error) {
        console.error("Failed to fetch more reports:", error);
        return [];
    }
}

export async function deleteReportedMessageAction(guildId: string, reportId: number, channelId: string, messageId: string): Promise<void> {
    try {
        await verifyGuildAccess(guildId);
        await deleteReportedMessageCommand(reportId, channelId, messageId);
        revalidatePath(`/dashboard/${guildId}/report`);
    } catch (error) {
        console.error("Failed to delete reported message:", error);
        throw new Error(error instanceof Error ? error.message : "Failed to delete message.");
    }
}

export async function resolveReportStatusAction(guildId: string, reportId: number, status: ReportAction): Promise<void> {
    try {
        await verifyGuildAccess(guildId);
        const session = await auth();

        if (!session?.user) {
            throw new Error("Unauthorized.");
        }

        await resolveReportStatusCommand(reportId, status, session.user.name ?? "Moderator");
        revalidatePath(`/dashboard/${guildId}/report`);
    } catch (error) {
        console.error("Failed to resolve report status:", error);
        throw new Error(error instanceof Error ? error.message : "Failed to resolve report.");
    }
}

export async function timeoutUserAction(guildId: string, reportId: number, durationMins: number, reason?: string): Promise<void> {
    try {
        await verifyGuildAccess(guildId);
        const session = await auth();

        if (!session?.user) {
            throw new Error("Unauthorized.");
        }

        await timeoutUserCommand(reportId, durationMins, session.user.name ?? "Moderator", reason);
        revalidatePath(`/dashboard/${guildId}/report`);
    } catch (error) {
        console.error("Failed to timeout user:", error);
        throw new Error(error instanceof Error ? error.message : "Failed to timeout user.");
    }
}

export async function warnUserAction(guildId: string, reportId: number, reason?: string): Promise<void> {
    try {
        await verifyGuildAccess(guildId);
        const session = await auth();

        if (!session?.user) {
            throw new Error("Unauthorized.");
        }

        await warnUserCommand(reportId, session.user.name ?? "Moderator", reason);
        revalidatePath(`/dashboard/${guildId}/report`);
    } catch (error) {
        console.error("Failed to warn user:", error);
        throw new Error(error instanceof Error ? error.message : "Failed to warn user.");
    }
}

export async function banUserAction(guildId: string, reportId: number, durationMins?: number, reason?: string): Promise<void> {
    try {
        await verifyGuildAccess(guildId);
        const session = await auth();

        if (!session?.user) {
            throw new Error("Unauthorized.");
        }

        await banUserCommand(reportId, session.user.name ?? "Moderator", durationMins, reason);
        revalidatePath(`/dashboard/${guildId}/report`);
    } catch (error) {
        console.error("Failed to ban user:", error);
        throw new Error(error instanceof Error ? error.message : "Failed to ban user.");
    }
}

export async function saveReportConfigAction(guildId: string, rawData: unknown): Promise<void> {
    try {
        await verifyGuildAccess(guildId);
        const validatedConfig = reportConfigSchema.parse(rawData);
        await saveReportConfig(guildId, validatedConfig);
        revalidatePath(`/dashboard/${guildId}/report`);
    } catch (error) {
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0]?.message || "Invalid report configuration.");
        }
        console.error("Failed to save report config:", error);
        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}