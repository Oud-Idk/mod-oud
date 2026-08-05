
import {
    birthdayConfigSchema,
    type BirthdayConfig,
    type BirthdayConfigInput,
} from "./types";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";

export async function getBirthdayConfig(guildId: string): Promise<BirthdayConfig> {
    const dbBirthday = await getGuildConfigField<unknown>(guildId, "birthday");
    return birthdayConfigSchema.parse(dbBirthday ?? {});
}

export async function saveBirthdayConfig(
    guildId: string,
    rawConfig: BirthdayConfigInput
): Promise<BirthdayConfig> {
    const validated = birthdayConfigSchema.parse(rawConfig);
    await saveGuildConfigField(guildId, "birthday", validated);
    return validated;
}