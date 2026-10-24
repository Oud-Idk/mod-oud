import { z } from "zod";
import { backendFetch } from "@/lib/backend";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";
import {
    dynamicSlowmodeConfigSchema,
    slowmodeStatusSchema,
    type DynamicSlowmodeConfig,
    type SlowmodeStatus,
} from "./types";

export async function getDynamicSlowmodeConfig(guildId: string): Promise<DynamicSlowmodeConfig> {
    const validGuildId = z.string().min(1).parse(guildId);
    const dbConfig = await getGuildConfigField(validGuildId, "dynamic_slowmode");
    return dynamicSlowmodeConfigSchema.parse(dbConfig ?? {});
}

export async function saveDynamicSlowmodeConfig(
    guildId: string,
    config: DynamicSlowmodeConfig
): Promise<DynamicSlowmodeConfig> {
    await saveGuildConfigField(guildId, "dynamic_slowmode", config);
    return config;
}

/**
 * Live per-channel state.
 *
 * The bot owns the counts and the current slowmode, so the dashboard asks rather than
 * recomputing. A dashboard-side copy of the control law would drift the moment the ladder
 * changes, and it would be showing numbers the bot never acted on.
 */
export async function getSlowmodeStatus(guildId: string): Promise<SlowmodeStatus> {
    const validGuildId = z.string().min(1).parse(guildId);

    const response = await backendFetch(`/api/guilds/${validGuildId}/slowmode/status`, {
        method: "GET",
    });

    if (!response.ok) {
        if (response.status >= 500) {
            throw new Error("Could not read dynamic slowmode status.");
        }

        const detail = (await response.text()).trim();
        throw new Error(detail === "" ? "Could not read dynamic slowmode status." : detail);
    }

    return slowmodeStatusSchema.parse(await response.json());
}
