import { z } from "zod";
import {
    moderationDMsConfigSchema,
    type ModerationDMsConfig,
} from "./types";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";

export async function getModerationDMsConfig(guildId: string): Promise<ModerationDMsConfig> {
    const validGuildId = z.string().min(1).parse(guildId);
    const dbConfig = await getGuildConfigField<unknown>(validGuildId, "moderation_dms");
    return moderationDMsConfigSchema.parse(dbConfig ?? {});
}

export async function saveModerationDMsConfig(
    guildId: string,
    config: ModerationDMsConfig
): Promise<ModerationDMsConfig> {
    await saveGuildConfigField(guildId, "moderation_dms", config);
    return config;
}