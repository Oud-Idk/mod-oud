"use server";

import { db } from "@/utils/init/db";
import { ReportedMessage } from "@/types/reports";
import { auth } from "@/auth";

export async function fetchInitialReports(guildId: string): Promise<ReportedMessage[]> {
    try {
        const result = await db.query(
            `SELECT *
             FROM reported_messages
             WHERE guild_id = $1
             ORDER BY id DESC
             LIMIT 10`,
            [guildId]
        );
        return result.rows;
    } catch (error) {
        console.error("Failed to fetch initial reports:", error);
        return [];
    }
}

export async function fetchMoreReports(guildId: string, beforeId: number): Promise<ReportedMessage[]> {
    try {
        const result = await db.query(
            `SELECT *
             FROM reported_messages
             WHERE guild_id = $1
               AND id < $2
             ORDER BY id DESC
             LIMIT 10`,
            [guildId, beforeId]
        );
        return result.rows;
    } catch (error) {
        console.error("Failed to fetch more reports:", error);
        return [];
    }
}

export async function deleteReportedMessage(reportId: number, channelId: string, messageId: string) {
    try {
        const response = await fetch("http://localhost:8080/api/commands", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                action: "delete_message",
                report_id: reportId,
                channel_id: channelId,
                message_id: messageId,
            }),
        });

        if (!response.ok) {
            const text = await response.text();
            console.error("Failed to delete message via REST:", text);
            return { success: false, error: text || "Failed to process request" };
        }

        return { success: true };
    } catch (error) {
        console.error("Failed to call delete message REST endpoint:", error);
        return { success: false, error: "Failed to connect to API server" };
    }
}

export async function resolveReportStatus(
    reportId: number,
    status: "under_review" | "actioned" | "dismissed"
) {
    try {
        const session = await auth();

        if (!session || !session.accessToken) {
            return { success: false, error: "Unauthorized" };
        }

        const response = await fetch("http://localhost:8080/api/commands", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                action: "resolve_report",
                report_id: reportId,
                status: status,
                name: session.user?.name ?? ""
            }),
        });

        if (!response.ok) {
            const text = await response.text();
            console.error("Failed to update report status via REST:", text);
            return { success: false, error: text || "Failed to process request" };
        }

        return { success: true };
    } catch (error) {
        console.error("Failed to call resolve report status REST endpoint:", error);
        return { success: false, error: "Failed to connect to API server" };
    }
}

export async function timeoutUser(reportId: number, durationMins: number, reason?: string) {
    try {
        const session = await auth();

        if (!session || !session.accessToken) {
            return { success: false, error: "Unauthorized" };
        }

        console.log(`[Next.js Action] Requesting timeout for Report #${reportId} (${durationMins}m)`);

        const response = await fetch("http://localhost:8080/api/commands", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                action: "timeout_user",
                report_id: reportId,
                duration_mins: durationMins,
                reason: reason || undefined,
                name: session.user?.name ?? "",
            }),
        });

        if (!response.ok) {
            const text = await response.text();
            console.error("Failed to timeout user via REST:", text);
            return { success: false, error: text || "Failed to process timeout" };
        }

        return { success: true };
    } catch (error) {
        console.error("Failed to call timeout user REST endpoint:", error);
        return { success: false, error: "Failed to connect to API server" };
    }
}

export async function warnUser(reportId: number, reason?: string) {
    try {
        console.log(`[Next.js Action] Requesting warning for Report #${reportId}`);

        const session = await auth();

        if (!session || !session.accessToken) {
            return { success: false, error: "Unauthorized" };
        }

        const response = await fetch("http://localhost:8080/api/commands", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                action: "warn_user",
                report_id: reportId,
                reason: reason || undefined,
                name: session.user?.name ?? "",
            }),
        });

        if (!response.ok) {
            const text = await response.text();
            console.error("Failed to warn user via REST:", text);
            return { success: false, error: text || "Failed to process warning" };
        }

        return { success: true };
    } catch (error) {
        console.error("Failed to call warn user REST endpoint:", error);
        return { success: false, error: "Failed to connect to API server" };
    }
}

export async function banUser(reportId: number, durationMins?: number, reason?: string) {
    try {
        const session = await auth();

        if (!session || !session.accessToken) {
            return { success: false, error: "Unauthorized" };
        }

        const response = await fetch("http://localhost:8080/api/commands", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                action: "ban_user",
                report_id: reportId,
                duration_mins: durationMins || undefined,
                reason: reason || undefined,
                name: session.user?.name ?? "",
            }),
        });

        if (!response.ok) {
            const text = await response.text();
            console.error("Failed to ban user via REST:", text);
            return { success: false, error: text || "Failed to process ban" };
        }

        return { success: true };
    } catch (error) {
        console.error("Failed to call ban user REST endpoint:", error);
        return { success: false, error: "Failed to connect to API server" };
    }
}