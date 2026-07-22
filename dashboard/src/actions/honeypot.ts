"use server";

import { revalidatePath } from "next/cache";
import { invalidateGuildChannelCache } from "@/utils/discord";
import { verifyGuildAccess } from "@/actions/config";
import { getHoneypotConfig, saveHoneypotConfig } from "@/utils/db/config";
import { HoneypotConfig } from "@/types/db/config";

export async function setupHoneypotAction(guildId: string, channelName: string) {
    try {
        await verifyGuildAccess(guildId);
        const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://localhost:8080";

        const res = await fetch(`${backendUrl}/api/guilds/${guildId}/honeypot`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                channel_name: channelName,
            }),
        });

        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(errorText || "Rust backend went boom.");
        }

        const data = (await res.json()) as { channel_id: string };

        try {
            await invalidateGuildChannelCache(guildId);
        } catch (cacheErr) {
            console.error("Could not reset the Discord channels cache list:", cacheErr);
        }

        revalidatePath(`/dashboard/${guildId}`);

        const currentConfig = await getHoneypotConfig(guildId);
        const updatedConfig: HoneypotConfig = {
            ...currentConfig,
            channelId: data.channel_id,
        };

        await saveHoneypotConfig(guildId, updatedConfig);
        revalidatePath(`/dashboard/${guildId}/welcome`);

        return { success: true, channelId: data.channel_id };
    } catch (error) {
        console.error("Honeypot setup error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "An unknown error occurred"
        };
    }
}