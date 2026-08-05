"use server";

import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { ReportedMessage, ReportAction, ReportConfig } from "@/features/report/types";
import {
    getInitialReportsFromDb,
    getMoreReportsFromDb,
    deleteReportedMessageCommand,
    resolveReportStatusCommand,
    timeoutUserCommand,
    warnUserCommand,
    banUserCommand,
    saveReportConfig,
} from "./queries";
import { verifyGuildAccess } from "@/features/_shared/guild";

export async function fetchInitialReports(guildId: string): Promise<ReportedMessage[]> {
    try {
        return await getInitialReportsFromDb(guildId);
    } catch (error) {
        console.error("Failed to fetch initial reports:", error);
        return [];
    }
}

export async function fetchMoreReports(guildId: string, beforeId: number): Promise<ReportedMessage[]> {
    try {
        return await getMoreReportsFromDb(guildId, beforeId);
    } catch (error) {
        console.error("Failed to fetch more reports:", error);
        return [];
    }
}

export async function deleteReportedMessage(reportId: number, channelId: string, messageId: string) {
    try {
        await deleteReportedMessageCommand(reportId, channelId, messageId);
        return { success: true };
    } catch (error) {
        console.error("Failed to call delete message REST endpoint:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to connect to API server",
        };
    }
}

export async function resolveReportStatus(reportId: number, status: ReportAction) {
    try {
        const session = await auth();

        if (!session || !session.accessToken) {
            return { success: false, error: "Unauthorized" };
        }

        await resolveReportStatusCommand(reportId, status, session.user?.name ?? "");
        return { success: true };
    } catch (error) {
        console.error("Failed to call resolve report status REST endpoint:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to connect to API server",
        };
    }
}

export async function timeoutUser(reportId: number, durationMins: number, reason?: string) {
    try {
        const session = await auth();

        if (!session || !session.accessToken) {
            return { success: false, error: "Unauthorized" };
        }

        console.log(`Requesting timeout for Report #${reportId} (${durationMins}m)`);
        await timeoutUserCommand(reportId, durationMins, session.user?.name ?? "", reason);

        return { success: true };
    } catch (error) {
        console.error("Failed to call timeout user REST endpoint:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to connect to API server",
        };
    }
}

export async function warnUser(reportId: number, reason?: string) {
    try {
        const session = await auth();

        if (!session || !session.accessToken) {
            return { success: false, error: "Unauthorized" };
        }

        console.log(`Requesting warning for Report #${reportId}`);
        await warnUserCommand(reportId, session.user?.name ?? "", reason);

        return { success: true };
    } catch (error) {
        console.error("Failed to call warn user REST endpoint:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to connect to API server",
        };
    }
}

export async function banUser(reportId: number, durationMins?: number, reason?: string) {
    try {
        const session = await auth();

        if (!session || !session.accessToken) {
            return { success: false, error: "Unauthorized" };
        }

        await banUserCommand(reportId, session.user?.name ?? "", durationMins, reason);
        return { success: true };
    } catch (error) {
        console.error("Failed to call ban user REST endpoint:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to connect to API server",
        };
    }
}

export async function saveReportConfigAction(guildId: string, data: ReportConfig) {
    try {
        await verifyGuildAccess(guildId);
        await saveReportConfig(guildId, data);
        revalidatePath(`/dashboard/${guildId}/report`);
    } catch (error) {
        console.error("Failed to save report config:", error);
        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}