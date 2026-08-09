import { type HoneypotConfig, honeypotConfigSchema } from "./types";
import { invalidateGuildChannelCache } from "@/features/_shared/channels";
import { z } from "zod";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";

export async function saveHoneypotConfig(guildId: string, config: HoneypotConfig): Promise<void> {
    await saveGuildConfigField(guildId, "honeypot", config);
}

export async function getHoneypotConfig(guildId: string): Promise<HoneypotConfig> {
    const dbHoneypot = await getGuildConfigField(guildId, "honeypot");
    return honeypotConfigSchema.parse(dbHoneypot ?? {});
}

const backendHoneypotResponseSchema = z.object({
    channel_id: z.string(),
});

export async function setupHoneypot(guildId: string, channelName: string): Promise<{ channelId: string }> {
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
        throw new Error(errorText || "Rust backend request failed.");
    }

    const rawJson = await res.json();
    const data = backendHoneypotResponseSchema.parse(rawJson);

    try {
        await invalidateGuildChannelCache(guildId);
    } catch (cacheErr) {
        console.error("Could not reset the Discord channels cache list:", cacheErr);
    }

    const currentConfig = await getHoneypotConfig(guildId);
    const updatedConfig: HoneypotConfig = {
        ...currentConfig,
        channelId: data.channel_id,
        enabled: true,
    };

    await saveHoneypotConfig(guildId, updatedConfig);

    return { channelId: data.channel_id };
}