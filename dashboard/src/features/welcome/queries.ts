
import { type WelcomeConfig, welcomeConfigSchema } from "./types";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";

export async function getWelcomeConfig(guildId: string): Promise<WelcomeConfig> {
    const dbWelcome = await getGuildConfigField<unknown>(guildId, "welcome");
    return welcomeConfigSchema.parse(dbWelcome ?? {});
}

export async function saveWelcomeConfig(guildId: string, config: WelcomeConfig): Promise<void> {
    await saveGuildConfigField(guildId, 'welcome', config);
}