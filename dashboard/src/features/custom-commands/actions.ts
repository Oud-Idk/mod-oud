"use server";

import { revalidatePath } from "next/cache";
import redis from "@/lib/redis";
import { z } from "zod";

import { CustomCommand, SaveCustomCommandData, SaveCustomCommandSchema, CustomPrefixConfig, customPrefixSchema } from "@/features/custom-commands/types";
import { deleteCustomCommand, getCustomCommandName, saveCustomCommand, saveCustomPrefix } from "@/features/custom-commands/queries";
import { verifyGuildAccess } from "@/features/_shared/guild";

async function invalidateCommandCache(guildId: string, ...commandNames: (string | undefined | null)[]): Promise<void> {
    const keys = new Set<string>([`cmd_anywhere:${guildId}`]);
    for (const name of commandNames) {
        if (name !== undefined && name !== null && name.trim() !== "") {
            keys.add(`cmd:${guildId}:${name.toLowerCase()}`);
        }
    }
    try {
        await redis.del(...keys);
    } catch (err) {
        console.error("Failed to clear Redis cache for command:", err);
    }
}

export async function saveCustomCommandAction(guildId: string, config: SaveCustomCommandData): Promise<CustomCommand> {
    try {
        await verifyGuildAccess(guildId);

        SaveCustomCommandSchema.parse(config);

        // A rename leaves the old key behind, and the bot would keep serving the old command
        // from it until the cache expires.
        const previousName =
            config.id !== undefined ? await getCustomCommandName(guildId, config.id) : null;

        const ret = await saveCustomCommand(guildId, config);

        await invalidateCommandCache(guildId, previousName, ret.name);

        revalidatePath(`/dashboard/${guildId}/custom-commands`);
        return ret;
    } catch (error) {
        console.error("Failed to save custom command:", error);

        if (error instanceof z.ZodError) {
            const firstErrorMessage = error.issues[0].message;
            throw new Error(firstErrorMessage);
        }

        throw new Error(error instanceof Error ? error.message : "Could not save custom command.");
    }
}

export async function deleteCustomCommandAction(guildId: string, id: number, commandName?: string): Promise<boolean> {
    try {
        await verifyGuildAccess(guildId);

        // The name is read from the row so the key is evicted even when the caller omits it.
        const storedName = await getCustomCommandName(guildId, id);

        const ret = await deleteCustomCommand(id, guildId);

        await invalidateCommandCache(guildId, storedName, commandName);

        revalidatePath(`/dashboard/${guildId}/custom-commands`);
        return ret;
    } catch (error) {
        console.error("Failed to delete custom command:", error);
        throw new Error(error instanceof Error ? error.message : "Could not delete custom command.");
    }
}

export async function saveCustomPrefixAction(guildId: string, rawData: unknown): Promise<void> {
    try {
        await verifyGuildAccess(guildId);

        const validated: CustomPrefixConfig = customPrefixSchema.parse(rawData);

        await saveCustomPrefix(guildId, validated);

        revalidatePath(`/dashboard/${guildId}/custom-commands`);
    } catch (error) {
        console.error("Failed to save custom prefix:", error);

        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0].message);
        }

        throw new Error(error instanceof Error ? error.message : "Could not save custom prefix.");
    }
}