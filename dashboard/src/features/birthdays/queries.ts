import { BirthdayConfigSchema, BirthdayConfig } from "./types";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";

export async function getBirthdayConfig(guildId: string): Promise<BirthdayConfig> {
    const dbBirthday = await getGuildConfigField<unknown>(guildId, "birthday");
    return BirthdayConfigSchema.parse(dbBirthday ?? {});
}

export async function saveBirthdayConfig(
    guildId: string,
    rawConfig: BirthdayConfig
): Promise<BirthdayConfig> {
    const validated = BirthdayConfigSchema.parse(rawConfig);
    await saveGuildConfigField(guildId, "birthday", validated);
    return validated;
}