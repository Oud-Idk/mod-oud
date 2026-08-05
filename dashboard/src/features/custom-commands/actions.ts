"use server";

import { revalidatePath } from "next/cache";
import redis from "@/lib/redis";

import { CustomCommand, SaveCustomCommandData } from "@/features/custom-commands/types";
import { deleteCustomCommand, saveCustomCommand } from "@/features/custom-commands/queries";
import { verifyGuildAccess } from "@/features/_shared/guild";

export async function saveCustomCommandAction(guildId: string, config: SaveCustomCommandData): Promise<CustomCommand> {
    await verifyGuildAccess(guildId);
    const ret = await saveCustomCommand(config);

    if (ret && ret.name) {
        const cacheKey = `cmd:${guildId}:${ret.name.toLowerCase()}`;
        try {
            await redis.del(cacheKey);
        } catch (err) {
            console.error("Failed to clear Redis cache for command:", err);
        }
    }

    revalidatePath(`/dashboard/${guildId}/custom-commands`);
    return ret;
}

export async function deleteCustomCommandAction(guildId: string, id: number, commandName?: string): Promise<boolean> {
    await verifyGuildAccess(guildId);
    const ret = await deleteCustomCommand(id);

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
}