"use server";

import { deleteGiveaway, saveGiveaway } from "@/features/giveaways/queries";
import { backendFetch } from "@/lib/backend";
import { revalidatePath } from "next/cache";
import {
    Giveaway,
    SaveGiveawayData,
    SaveGiveawaySchema,
    sendGiveawayInputSchema,
    SendGiveawayResponse,
    sendGiveawayResponseSchema,
} from "@/features/giveaways/types";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { z } from "zod";
import { config as globalConfig } from "@/config"

export async function saveGiveawayAction(guildId: string, config: SaveGiveawayData): Promise<Giveaway> {
    try {
        await verifyGuildAccess(guildId);
        const validated = SaveGiveawaySchema.parse(config);
        const ret = await saveGiveaway(validated);

        if (ret.message_id !== null) {
            try {
                await backendFetch(`/api/guilds/${guildId}/giveaways/${ret.id.toString()}/edit`, { method: "POST" });
            } catch (err) {
                console.error("Failed to auto-update Discord message on save:", err);
            }
        }

        revalidatePath(`/dashboard/${guildId}/giveaways`);
        return ret;
    } catch (error) {
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0].message);
        }
        throw new Error(error instanceof Error ? error.message : "Failed to save giveaway.");
    }
}

export async function deleteGiveawayAction(guildId: string, id: number): Promise<boolean> {
    try {
        await verifyGuildAccess(guildId);
        const ret = await deleteGiveaway(id, guildId);
        revalidatePath(`/dashboard/${guildId}/giveaways`);
        return ret;
    } catch (error) {
        throw new Error(error instanceof Error ? error.message : "Failed to delete giveaway.");
    }
}

export async function sendGiveawayAction(guildId: string, id: number): Promise<SendGiveawayResponse> {
    try {
        const validatedInput = sendGiveawayInputSchema.parse({ guildId, id });
        await verifyGuildAccess(validatedInput.guildId);
        const response = await backendFetch(`/api/guilds/${validatedInput.guildId}/giveaways/${validatedInput.id.toString()}/send`,
            { method: "POST" }
        );

        if (!response.ok) {
            const error_text = (await response.text()).trim();
            throw new Error(error_text !== "" ? error_text : "Failed to dispatch giveaway message.");
        }

        const validatedResponse = sendGiveawayResponseSchema.parse(await response.json());
        revalidatePath(`/dashboard/${validatedInput.guildId}/giveaways`);
        return validatedResponse;
    } catch (error) {
        throw new Error(error instanceof Error ? error.message : "Failed to launch giveaway.");
    }
}

export async function deleteGiveawayDiscordMessageAction(guildId: string, id: number): Promise<void> {
    try {
        await verifyGuildAccess(guildId);
        const response = await backendFetch(`/api/guilds/${guildId}/giveaways/${id.toString()}/message`, { method: "DELETE" });

        if (!response.ok) {
            const error_text = (await response.text()).trim();
            throw new Error(error_text !== "" ? error_text : "Failed to delete Discord message.");
        }

        revalidatePath(`/dashboard/${guildId}/giveaways`);
    } catch (error) {
        throw new Error(error instanceof Error ? error.message : "Failed to delete Discord message.");
    }
}