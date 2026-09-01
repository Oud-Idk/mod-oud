import { gamblingConfigSchema, GamblingConfig } from "@/features/gambling/types";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";

export async function getGamblingConfig(guildId: string): Promise<GamblingConfig> {
    const raw = await getGuildConfigField(guildId, "gambling");
    return gamblingConfigSchema.parse(raw ?? {});
}

export async function saveGamblingConfig(guildId: string, config: GamblingConfig): Promise<void> {
    await saveGuildConfigField(guildId, "gambling", config);
}
