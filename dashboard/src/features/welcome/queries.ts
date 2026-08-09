import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";
import {
    welcomeConfigSchema,
    type WelcomeConfig,
} from "./types";

export async function getWelcomeConfig(guildId: string): Promise<WelcomeConfig> {
    const dbWelcome = await getGuildConfigField(guildId, "welcome");
    return welcomeConfigSchema.parse(dbWelcome ?? {});
}

export async function saveWelcomeConfig(guildId: string, config: WelcomeConfig): Promise<void> {
    await saveGuildConfigField(guildId, "welcome", config);
}