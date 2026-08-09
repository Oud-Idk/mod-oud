import { z } from "zod";
import {
    CounterChannel,
    MemberCounterConfig,
    memberCounterConfigSchema,
} from "./types";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";

export async function getMemberCounterConfig(guildId: string): Promise<MemberCounterConfig> {
    const validGuildId = z.string().min(1).parse(guildId);
    const dbConfig = await getGuildConfigField(validGuildId, "member_counter");
    return memberCounterConfigSchema.parse(dbConfig ?? {});
}

export async function saveMemberCounterConfig(
    guildId: string,
    config: MemberCounterConfig
): Promise<MemberCounterConfig> {
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
        throw new Error(errorData.message || "Failed to create category and channels via bot backend.");
    }

    return await response.json();
}