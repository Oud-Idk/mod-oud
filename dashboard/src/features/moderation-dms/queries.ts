
import {
    moderationDMsConfigSchema,
    type ModerationDMsConfig,
    type ModerationDMsInput,
} from "./types";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";

export async function getModerationDMsConfig(guildId: string): Promise<ModerationDMsConfig> {
    const dbConfig = await getGuildConfigField<unknown>(guildId, "moderation_dms");
    return moderationDMsConfigSchema.parse(dbConfig ?? {});
}

export async function saveModerationDMsConfig(
    guildId: string,
    rawConfig: ModerationDMsInput
): Promise<ModerationDMsConfig> {
    const config = moderationDMsConfigSchema.parse(rawConfig);
    await saveGuildConfigField(guildId, "moderation_dms", config);
    return config;
}