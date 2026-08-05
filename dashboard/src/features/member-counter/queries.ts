import { CounterChannel, type MemberCounterConfig, memberCounterConfigSchema, type MemberCounterInput, } from "./types";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";

export async function getMemberCounterConfig(guildId: string): Promise<MemberCounterConfig> {
    const dbConfig = await getGuildConfigField<unknown>(guildId, "member_counter");
    return memberCounterConfigSchema.parse(dbConfig ?? {});
}

export async function saveMemberCounterConfig(
    guildId: string,
    rawConfig: MemberCounterInput
): Promise<MemberCounterConfig> {
    const config = memberCounterConfigSchema.parse(rawConfig);
    await saveGuildConfigField(guildId, "member_counter", config);
    return config;
}

export async function setupMemberCounterChannels(
    guildId: string,
    counters: CounterChannel[]
) {
    const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://localhost:8080";

    const response = await fetch(`${backendUrl}/api/guilds/${guildId}/member-counter/setup`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ counters }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(response);
        throw new Error(errorData.message || "Failed to create category and channels via bot backend.");
    }

    return await response.json();
}