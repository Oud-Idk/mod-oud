"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
    fetchMoreDeletedMessages,
    fetchMoreEditedMessages,
    saveMessageLoggingConfig
} from "@/features/message-logging/queries";
import { DeletedMessage, EditedMessage, MessageLoggingConfig, messageLoggingConfigSchema } from "@/features/message-logging/types";
import { verifyGuildAccess } from "@/features/_shared/guild";

export async function saveMessageLoggingConfigAction(guildId: string, data: MessageLoggingConfig): Promise<void> {
    try {
        await verifyGuildAccess(guildId);
        const validConfig = messageLoggingConfigSchema.parse(data);
        await saveMessageLoggingConfig(guildId, validConfig);
        revalidatePath(`/dashboard/${guildId}/message-logging`);
    } catch (error) {
        console.error("Failed to save message logging config:", error);
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0]?.message || "Validation Error");
        }
        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}

export async function fetchMoreEditedMessagesAction(guildId: string, beforeId: number): Promise<EditedMessage[]> {
    try {
        await verifyGuildAccess(guildId);
        const validGuildId = z.string().min(1).parse(guildId);
        const validBeforeId = z.number().int().parse(beforeId);
        return await fetchMoreEditedMessages(validGuildId, validBeforeId);
    } catch (error) {
        console.error("Failed to fetch edited messages:", error);
        return [];
    }
}

export async function fetchMoreDeletedMessagesAction(guildId: string, beforeId: number): Promise<DeletedMessage[]> {
    try {
        await verifyGuildAccess(guildId);
        const validGuildId = z.string().min(1).parse(guildId);
        const validBeforeId = z.number().int().parse(beforeId);
        return await fetchMoreDeletedMessages(validGuildId, validBeforeId);
    } catch (error) {
        console.error("Failed to fetch deleted messages:", error);
        return [];
    }
}