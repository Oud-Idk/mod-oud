"use server";

import { db } from "@/utils/init/db";
import { ReportedMessage } from "@/types/reports";
import redis from "@/utils/init/redis";

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

// Server Action matching the fetchMoreAction signature in the hook
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

// actions/reports.ts
export async function deleteReportedMessage(reportId: number, channelId: string, messageId: string) {
    try {
        console.log(`[Next.js Action] Requesting deletion for Report #${reportId}`); // <-- Add this
        const payload = JSON.stringify({
            action: "delete_message",
            report_id: reportId,
            channel_id: channelId,
            message_id: messageId,
        });
        await redis.publish("discord:commands", payload);
        return { success: true };
    } catch (error) {
        console.error("Failed to publish delete command:", error);
        return { success: false, error: "Failed to connect to pub/sub server" };
    }
}