"use server";

import { revalidatePath } from "next/cache";
import {
    fetchMoreDeletedMessages,
    fetchMoreEditedMessages,
    saveMessageLoggingConfig
} from "@/features/message-logging/queries";
import { DeletedMessage, EditedMessage, MessageLoggingConfig } from "@/features/message-logging/types";
import { verifyGuildAccess } from "@/features/_shared/guild";

export async function saveMessageLoggingConfigAction(guildId: string, data: MessageLoggingConfig): Promise<void> {
    try {
        await verifyGuildAccess(guildId);
        await saveMessageLoggingConfig(guildId, data);
        revalidatePath(`/dashboard/${guildId}/message-logging`);
    } catch (error) {
        console.error("Failed to save message logging config:", error);
        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}

export async function fetchMoreEditedMessagesAction(guildId: string, beforeId: number): Promise<EditedMessage[]> {
    try {
        await verifyGuildAccess(guildId);
        return await fetchMoreEditedMessages(guildId, beforeId);
    } catch (error) {
        console.error("Failed to fetch edited messages:", error);
        throw new Error("Could not fetch messages.");
    }
}

export async function fetchMoreDeletedMessagesAction(guildId: string, beforeId: number): Promise<DeletedMessage[]> {
    try {
        await verifyGuildAccess(guildId);
        return await fetchMoreDeletedMessages(guildId, beforeId);
    } catch (error) {
        console.error("Failed to fetch deleted messages:", error);
        throw new Error("Could not fetch messages.");
    }
}