"use server";

import { revalidatePath } from "next/cache";
import redis from "@/lib/redis";
import { z } from "zod";

import { CustomCommand, SaveCustomCommandData, SaveCustomCommandSchema } from "@/features/custom-commands/types";
import { deleteCustomCommand, saveCustomCommand } from "@/features/custom-commands/queries";
import { verifyGuildAccess } from "@/features/_shared/guild";

export async function saveCustomCommandAction(guildId: string, config: SaveCustomCommandData): Promise<CustomCommand> {
    try {
        await verifyGuildAccess(guildId);

        SaveCustomCommandSchema.parse(config);

        const ret = await saveCustomCommand(config);

        if (ret?.name) {
            const cacheKey = `cmd:${guildId}:${ret.name.toLowerCase()}`;
            try {
                await redis.del(cacheKey);
            } catch (err) {
                console.error("Failed to clear Redis cache for command:", err);
            }
        }

        revalidatePath(`/dashboard/${guildId}/custom-commands`);
        return ret;
    } catch (error) {
        console.error("Failed to save custom command:", error);

        if (error instanceof z.ZodError) {
            const firstErrorMessage = error.issues[0]?.message || "Invalid configuration.";
            throw new Error(firstErrorMessage);
        }

        throw new Error(error instanceof Error ? error.message : "Could not save custom command.");
    }
}

export async function deleteCustomCommandAction(guildId: string, id: number, commandName?: string): Promise<boolean> {
    try {
        await verifyGuildAccess(guildId);

        const ret = await deleteCustomCommand(id, guildId);

        if (commandName) {
            const cacheKey = `cmd:${guildId}:${commandName.toLowerCase()}`;
            try {
                await redis.del(cacheKey);
            } catch (err) {
                console.error("Failed to clear Redis cache on delete:", err);
            }
        }

        revalidatePath(`/dashboard/${guildId}/custom-commands`);
        return ret;
    } catch (error) {
        console.error("Failed to delete custom command:", error);
        throw new Error(error instanceof Error ? error.message : "Could not delete custom command.");
    }
}