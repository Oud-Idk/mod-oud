import { BirthdayConfigSchema, BirthdayConfig } from "./types";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";

export async function getBirthdayConfig(guildId: string): Promise<BirthdayConfig> {
    const dbBirthday = await getGuildConfigField(guildId, "birthday");
    return BirthdayConfigSchema.parse(dbBirthday ?? {});
}

export async function saveBirthdayConfig(
    guildId: string,
    config: BirthdayConfig
): Promise<BirthdayConfig> {
    await saveGuildConfigField(guildId, "birthday", config);
    return config;
}