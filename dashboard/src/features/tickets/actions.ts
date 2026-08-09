"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { verifyGuildAccess } from "@/features/_shared/guild";
import {
    getTicketConfig,
    getTicketHistory,
    getTicketList,
    saveTicketConfig,
} from "./queries";
import {
    SaveTicketConfig,
    SaveTicketConfigSchema,
    type Ticket,
    type TicketHistory,
} from "./types";

export async function getTicketsListAction(guildId: string): Promise<Ticket[]> {
    try {
        await verifyGuildAccess(guildId);
        return await getTicketList(guildId);
    } catch (error) {
        console.error("Failed to fetch ticket list:", error);
        throw new Error("Could not retrieve tickets list.");
    }
}

export async function getTicketHistoryAction(guildId: string, channelId: string): Promise<TicketHistory | null> {
    try {
        await verifyGuildAccess(guildId);
        return await getTicketHistory(channelId);
    } catch (error) {
        console.error("Failed to fetch ticket history:", error);
        throw new Error("Could not retrieve ticket history.");
    }
}

export async function sendTicketMessageAction(guildId: string, channelId: string): Promise<string> {
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

        const data = await response.json();

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

export async function deleteTicketMessageAction(guildId: string, channelId: string, messageId: string): Promise<void> {
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
        await saveTicketConfig(guildId, { ...currentConfig, postedMessageId: null });

        revalidatePath(`/dashboard/${guildId}/tickets`);
    } catch (error) {
        console.error("Failed to delete ticket message:", error);
        throw new Error(error instanceof Error ? error.message : "Could not delete ticket panel.");
    }
}

export async function saveTicketsConfigAction(guildId: string, data: SaveTicketConfig): Promise<void> {
    try {
        await verifyGuildAccess(guildId);

        const validatedData = SaveTicketConfigSchema.parse(data);
        await saveTicketConfig(guildId, validatedData);

        revalidatePath(`/dashboard/${guildId}/tickets`);
    } catch (error) {
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0]?.message || "Invalid ticket configuration.");
        }
        console.error("Failed to save tickets config:", error);
        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}