"use server";

import { MessageLoggingConfig } from "@/types/db/config";
import { saveMessageLoggingConfig } from "@/utils/db/config";
import { revalidatePath } from "next/cache";
import { fetchMoreDeletedMessages, fetchMoreEditedMessages } from "@/utils/db/messages";
import { verifyGuildAccess } from "@/actions/config";

export async function saveMessageLoggingConfigAction(guildId: string, data: MessageLoggingConfig) {
    try {
        await verifyGuildAccess(guildId);
        await saveMessageLoggingConfig(guildId, data);
        revalidatePath(`/dashboard/${guildId}/message-logging`);
    } catch (error) {
        console.error("Failed to save message logging config:", error);
        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}

export async function fetchMoreEditedMessagesAction(guildId: string, beforeId: number) {
    try {
        await verifyGuildAccess(guildId);
        return await fetchMoreEditedMessages(guildId, beforeId);
    } catch (error) {
        console.error("Failed to fetch edited messages:", error);
        throw new Error("Could not fetch messages.");
    }
}

export async function fetchMoreDeletedMessagesAction(guildId: string, beforeId: number) {
    try {
        await verifyGuildAccess(guildId);
        return await fetchMoreDeletedMessages(guildId, beforeId);
    } catch (error) {
        console.error("Failed to fetch deleted messages:", error);
        throw new Error("Could not fetch messages.");
    }
}