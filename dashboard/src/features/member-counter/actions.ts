"use server";

import { CounterChannel, MemberCounterConfig } from "@/features/member-counter/types";
import { saveMemberCounterConfig, setupMemberCounterChannels } from "@/features/member-counter/queries";
import { revalidatePath } from "next/cache";

import { verifyGuildAccess } from "@/features/_shared/guild";

interface AutoCreateResponse {
    success: boolean;
    counters?: CounterChannel[];
    error?: string;
}


export async function saveMemberCounterConfigAction(
    guildId: string,
    data: MemberCounterConfig
): Promise<void> {
    try {
        await verifyGuildAccess(guildId);
        await saveMemberCounterConfig(guildId, data);
        revalidatePath(`/dashboard/${guildId}/member-counter`);
    } catch (error) {
        console.error("Failed to save honeypot config:", error);
        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}

export async function setupMemberCounterChannelsAction(
    guildId: string,
    counters: CounterChannel[]
): Promise<AutoCreateResponse> {
    try {
        const data = await setupMemberCounterChannels(guildId, counters);

        return {
            success: true,
            counters: data.counters,
        };
    } catch (error) {
        console.error("[setupMemberCounterChannelsAction Error]:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "An unexpected error occurred while creating channels.",
        };
    }
}