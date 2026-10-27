"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import redis from "@/lib/redis";
import {
    deleteDiscordMessageFromBackend,
    deleteReactionMessage,
    getReactionMessageById,
    notifyBackendReactionMessageEdit,
    saveReactionMessage,
    sendReactionMessageToBackend,
} from "./queries";
import {
    saveReactionMessageInputSchema,
    type ReactionMessage,
    type SaveReactionMessageInput,
} from "./types";
import { verifyGuildAccess } from "@/features/_shared/guild";

/**
 * Safely invalidates all cached emoji and button mappings associated with a specific Discord message ID.
 */
async function invalidateMessageCache(
    messageId: string | null | undefined,
    guildId: string
): Promise<void> {
    if (messageId === null || messageId === undefined) return;

    try {
        const keysToDelete: string[] = [];

        for (const pattern of [
            `reaction_role:${guildId}:${messageId}:*`,
            `button_role:${guildId}:${messageId}:*`,
        ]) {
            let cursor = "0";

            do {
                const reply = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
                cursor = reply[0];
                keysToDelete.push(...reply[1]);
            } while (cursor !== "0");
        }

        if (keysToDelete.length > 0) {
            await redis.del(...keysToDelete);
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

        if (ret.message_id !== null && ret.message_id !== undefined) {
            await invalidateMessageCache(ret.message_id, guildId);
            await notifyBackendReactionMessageEdit(guildId, ret.id);
        }

        revalidatePath(`/dashboard/${guildId}/reaction-roles`);
        return ret;
    } catch (error) {
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0].message);
        }
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

        const msg = await getReactionMessageById(id);
        const ret = await deleteReactionMessage(id);

        if (msg?.message_id !== null && msg?.message_id !== undefined) {
            await invalidateMessageCache(msg.message_id, guildId);
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

        const data = await sendReactionMessageToBackend(guildId, id);

        await invalidateMessageCache(data.message_id, guildId);

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

        const msg = await getReactionMessageById(id);
        await deleteDiscordMessageFromBackend(guildId, id);

        if (msg?.message_id !== null && msg?.message_id !== undefined) {
            await invalidateMessageCache(msg.message_id, guildId);
        }

        revalidatePath(`/dashboard/${guildId}/reaction-roles`);
        return { success: true };
    } catch (error) {
        console.error("Error deleting reaction role Discord message:", error);
        throw new Error(error instanceof Error ? error.message : "An unexpected error occurred.");
    }
}