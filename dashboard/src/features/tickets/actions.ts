"use server";

import { Ticket, TicketConfig, TicketHistory } from "@/features/tickets/types";
import { getTicketConfig, getTicketHistory, getTicketList, saveTicketConfig } from "@/features/tickets/queries";
import { revalidatePath } from "next/cache";

import { verifyGuildAccess } from "@/features/_shared/guild";

/**
 * Fetches a list of tickets for a specific guild
 */
export async function getTicketsListAction(guildId: string): Promise<Ticket[]> {
    try {
        const res = await getTicketList(guildId);
        return res.rows;
    } catch (error) {
        console.error("Failed to fetch ticket list:", error);
        throw new Error("Could not retrieve tickets list.");
    }
}

/**
 * Fetches the detailed message history of a specific ticket channel
 */
export async function getTicketHistoryAction(channelId: string): Promise<TicketHistory | null> {
    try {
        return await getTicketHistory(channelId);
    } catch (error) {
        console.error("Failed to fetch ticket history:", error);
        throw new Error("Could not retrieve ticket history.");
    }
}

export async function sendTicketMessageAction(guildId: string, channelId: string) {
    try {
        await verifyGuildAccess(guildId);
        const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://localhost:8080";

        const response = await fetch(`${backendUrl}/api/guilds/${guildId}/tickets/send-message`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ channel_id: channelId }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || "Could not instruct the bot to send the message.");
        }

        const data = (await response.json()) as { message_id: string };

        const currentConfig = await getTicketConfig(guildId);
        await saveTicketConfig(guildId, {
            ...currentConfig,
            postedMessageId: data.message_id,
        });

        revalidatePath(`/dashboard/${guildId}/tickets`);
        return data.message_id;
    } catch (error) {
        console.error("Failed to send ticket message:", error);
        throw new Error(error instanceof Error ? error.message : "Could not post ticket panel.");
    }
}

export async function deleteTicketMessageAction(guildId: string, channelId: string, messageId: string) {
    try {
        await verifyGuildAccess(guildId);
        const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://localhost:8080";

        const response = await fetch(`${backendUrl}/api/guilds/${guildId}/tickets/delete-message`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ channel_id: channelId, message_id: messageId }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || "Could not instruct the bot to delete the message.");
        }

        const currentConfig = await getTicketConfig(guildId);
        const { postedMessageId, ...rest } = currentConfig;
        await saveTicketConfig(guildId, rest);

        revalidatePath(`/dashboard/${guildId}/tickets`);
    } catch (error) {
        console.error("Failed to delete ticket message:", error);
        throw new Error(error instanceof Error ? error.message : "Could not delete ticket panel.");
    }
}

export async function saveTicketsConfigAction(guildId: string, data: TicketConfig) {
    try {
        await verifyGuildAccess(guildId);
        await saveTicketConfig(guildId, data);
        revalidatePath(`/dashboard/${guildId}/leave`);
    } catch (error) {
        console.error("Failed to save tickets config:", error);
        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}