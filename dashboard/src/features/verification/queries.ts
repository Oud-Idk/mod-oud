import { getGuildConfigField, replaceGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";
import {
    verificationConfigSchema,
    type VerificationConfig,
} from "./types";

/**
 * Reads the membership verification config from the top-level `verification`
 * key, falling back to the legacy `welcome.verification` nesting for rows
 * written before the split migration.
 */
export async function getVerificationConfig(guildId: string): Promise<VerificationConfig> {
    const dbVerification = await getGuildConfigField(guildId, "verification");
    if (dbVerification !== null) {
        return verificationConfigSchema.parse(dbVerification);
    }

    const dbWelcome = await getGuildConfigField<{ verification?: unknown }>(guildId, "welcome");
    return verificationConfigSchema.parse(dbWelcome?.verification ?? {});
}

/**
 * Saves to the top-level `verification` key and removes the legacy nested
 * copy under `welcome` so the two can never drift apart.
 */
export async function saveVerificationConfig(guildId: string, config: VerificationConfig): Promise<void> {
    await saveGuildConfigField(guildId, "verification", config);

    const dbWelcome = await getGuildConfigField<Record<string, unknown>>(guildId, "welcome");
    if (dbWelcome !== null && "verification" in dbWelcome) {
        const cleaned = { ...dbWelcome };
        delete cleaned.verification;
        await replaceGuildConfigField(guildId, "welcome", cleaned);
    }
}
