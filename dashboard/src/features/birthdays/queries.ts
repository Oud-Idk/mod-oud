import {
    birthdayConfigSchema,
    type BirthdayConfig,
    type BirthdayConfigInput,
} from "./types";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";

function isPlainObject(val: unknown): val is Record<string, unknown> {
    return typeof val === "object" && val !== null && !Array.isArray(val);
}

export async function getBirthdayConfig(guildId: string): Promise<BirthdayConfig> {
    const dbBirthday = await getGuildConfigField<unknown>(guildId, "birthday");
    const safeData = isPlainObject(dbBirthday) ? dbBirthday : {};

    return birthdayConfigSchema.parse(safeData);
}

export async function saveBirthdayConfig(
    guildId: string,
    rawConfig: BirthdayConfigInput
): Promise<BirthdayConfig> {
    const validated = birthdayConfigSchema.parse(rawConfig);
    await saveGuildConfigField(guildId, "birthday", validated);
    return validated;
}