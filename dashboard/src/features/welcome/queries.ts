import { db } from "@/lib/db";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";
import {
    saveWelcomeConfigSchema,
    welcomeConfigSchema,
    type WelcomeConfig,
} from "./types";

export async function getWelcomeConfig(guildId: string): Promise<WelcomeConfig> {
    const dbWelcome = await getGuildConfigField<unknown>(guildId, "welcome");
    return welcomeConfigSchema.parse(dbWelcome ?? {});
}

export async function saveWelcomeConfig(guildId: string, config: WelcomeConfig): Promise<void> {
    await saveGuildConfigField(guildId, "welcome", config);
}