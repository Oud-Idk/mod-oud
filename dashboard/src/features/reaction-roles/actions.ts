"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import redis from "@/lib/redis";
import {
    deleteReactionMessage,
    getReactionMessages,
    saveReactionMessage,
} from "./queries";
import {
    saveReactionMessageInputSchema,
    type ReactionMessage,
    type SaveReactionMessageInput,
} from "./types";
import { verifyGuildAccess } from "@/features/_shared/guild";

/** Zod schema for validating dispatch response from the backend */
const sendResponseSchema = z.object({
    message_id: z.string(),
});

/**
 * Safely invalidates all cached emoji mappings associated with a specific Discord message ID.
 */
async function invalidateMessageCache(messageId: string | null | undefined): Promise<void> {
    if (!messageId) return;

    try {
        const pattern = `reaction_role:${messageId}:*`;
        let cursor = "0";
        const keysToDelete: string[] = [];

        do {
            const reply = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
            cursor = reply[0];
            keysToDelete.push(...reply[1]);
        } while (cursor !== "0");

        if (keysToDelete.length > 0) {
            await redis.del(...keysToDelete);
            console.log(`Invalidated cache keys for message ${messageId}:`, keysToDelete);
        }
    } catch (error) {
        console.error(`Failed to invalidate Redis cache for message ${messageId}:`, error);
    }
}

export async function saveReactionMessageAction(
    guildId: string,
    configInput: SaveReactionMessageInput
): Promise<ReactionMessage> {
    try {
        await verifyGuildAccess(guildId);

        const validatedInput = saveReactionMessageInputSchema.parse(configInput);
        const ret = await saveReactionMessage(validatedInput);

        if (ret && ret.message_id) {
            await invalidateMessageCache(ret.message_id);

            try {
                const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://localhost:8080";
                await fetch(
                    `${backendUrl}/api/guilds/${guildId}/reaction-roles/${ret.id}/edit`,
                    { method: "POST" }
                );
            } catch (err) {
                console.error("Failed to auto-update Discord message on save:", err);
            }
        }

        revalidatePath(`/dashboard/${guildId}/reaction-roles`);
        return ret;
    } catch (error) {
        console.error("Failed to save reaction message:", error);
        throw new Error(error instanceof Error ? error.message : "Could not save message.");
    }
}

export async function deleteReactionMessageAction(
    guildId: string,
    id: number
): Promise<boolean> {
    try {
        await verifyGuildAccess(guildId);

        let messageId: string | undefined = undefined;
        try {
            const messages = await getReactionMessages(guildId);
            const msg = messages.find((m) => m.id === id);
            if (msg?.message_id) messageId = msg.message_id;
        } catch (e) {
            console.warn("Could not find message details for cache invalidation before deletion:", e);
        }

        const ret = await deleteReactionMessage(id);

        if (messageId) {
            await invalidateMessageCache(messageId);
        }

        revalidatePath(`/dashboard/${guildId}/reaction-roles`);
        return ret;
    } catch (error) {
        console.error("Failed to delete reaction message:", error);
        throw new Error(error instanceof Error ? error.message : "Could not delete reaction message.");
    }
}

export async function sendReactionMessageAction(
    guildId: string,
    id: number
): Promise<{ message_id: string }> {
    try {
        await verifyGuildAccess(guildId);
        const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://localhost:8080";
        const response = await fetch(
            `${backendUrl}/api/guilds/${guildId}/reaction-roles/${id}/send`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || "Failed to dispatch reaction roles.");
        }

        const rawJson: unknown = await response.json();
        const data = sendResponseSchema.parse(rawJson);

        if (data.message_id) {
            await invalidateMessageCache(data.message_id);
        }

        revalidatePath(`/dashboard/${guildId}/reaction-roles`);
        return data;
    } catch (error) {
        console.error("Error dispatching reaction role:", error);
        throw new Error(error instanceof Error ? error.message : "An unexpected error occurred.");
    }
}

export async function deleteReactionDiscordMessageAction(
    guildId: string,
    id: number
): Promise<{ success: boolean }> {
    try {
        await verifyGuildAccess(guildId);

        let messageId: string | undefined = undefined;
        try {
            const messages = await getReactionMessages(guildId);
            const msg = messages.find((m) => m.id === id);
            if (msg?.message_id) messageId = msg.message_id;
        } catch (e) {
            console.warn("Could not find message details for cache invalidation before deletion:", e);
        }

        const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://localhost:8080";
        const response = await fetch(
            `${backendUrl}/api/guilds/${guildId}/reaction-roles/${id}/message`,
            {
                method: "DELETE",
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || "Failed to delete Discord message.");
        }

        if (messageId) {
            await invalidateMessageCache(messageId);
        }

        revalidatePath(`/dashboard/${guildId}/reaction-roles`);
        return { success: true };
    } catch (error) {
        console.error("Error deleting reaction role Discord message:", error);
        throw new Error(error instanceof Error ? error.message : "An unexpected error occurred.");
    }
}