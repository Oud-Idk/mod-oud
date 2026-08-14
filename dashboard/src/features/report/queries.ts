import { config } from "@/config";
import { reportConfigSchema, reportedMessageSchema, type ReportConfig, type ReportedMessage } from "./types";
import { db } from "@/lib/db";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";

export async function getReportConfig(guildId: string): Promise<ReportConfig> {
    const dbReport = await getGuildConfigField(guildId, "report");
    return reportConfigSchema.parse(dbReport ?? {});
}

export async function saveReportConfig(guildId: string, configData: ReportConfig): Promise<void> {
    await saveGuildConfigField(guildId, "report", configData);
}

export async function getInitialReportsFromDb(guildId: string): Promise<ReportedMessage[]> {
    const result = await db.query(
        `SELECT *
         FROM reported_messages
         WHERE guild_id = $1
         ORDER BY id DESC
         LIMIT 10`,
        [guildId]
    );
    return result.rows.map((row) => reportedMessageSchema.parse(row));
}

export async function getMoreReportsFromDb(guildId: string, beforeId: number): Promise<ReportedMessage[]> {
    const result = await db.query(
        `SELECT *
         FROM reported_messages
         WHERE guild_id = $1
           AND id < $2
         ORDER BY id DESC
         LIMIT 10`,
        [guildId, beforeId]
    );
    return result.rows.map((row) => reportedMessageSchema.parse(row));
}

async function sendReportCommand(payload: Record<string, unknown>): Promise<boolean> {
    const response = await fetch(`${config.backendInternalUrl}/api/commands`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
            errorText !== "" ? errorText : "Failed to process request with backend service."
        );
    }

    return true;
}

export async function deleteReportedMessageCommand(
    reportId: number,
    channelId: string,
    messageId: string
): Promise<boolean> {
    return sendReportCommand({
        action: "DELETE_MESSAGE",
        report_id: reportId,
        channel_id: channelId,
        message_id: messageId,
    });
}

export async function resolveReportStatusCommand(
    reportId: number,
    status: string,
    userName: string
): Promise<boolean> {
    return sendReportCommand({
        action: "RESOLVE_REPORT",
        report_id: reportId,
        status,
        name: userName,
    });
}

export async function timeoutUserCommand(
    reportId: number,
    durationMins: number,
    userName: string,
    reason?: string
): Promise<boolean> {
    return sendReportCommand({
        action: "TIMEOUT_USER",
        report_id: reportId,
        duration_mins: durationMins,
        reason: reason !== undefined && reason !== "" ? reason : undefined,
        name: userName,
    });
}

export async function warnUserCommand(
    reportId: number,
    userName: string,
    reason?: string
): Promise<boolean> {
    return sendReportCommand({
        action: "WARN_USER",
        report_id: reportId,
        reason: reason !== undefined && reason !== "" ? reason : undefined,
        name: userName,
    });
}

export async function banUserCommand(
    reportId: number,
    userName: string,
    durationMins?: number,
    reason?: string
): Promise<boolean> {
    return sendReportCommand({
        action: "BAN_USER",
        report_id: reportId,
        duration_mins: durationMins !== undefined && durationMins > 0 ? durationMins : undefined,
        reason: reason !== undefined && reason !== "" ? reason : undefined,
        name: userName,
    });
}