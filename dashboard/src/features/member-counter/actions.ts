"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
    CounterChannel,
    MemberCounterConfig,
    counterChannelSchema, AutoCreateResponse,
} from "@/features/member-counter/types";
import { saveMemberCounterConfig, setupMemberCounterChannels } from "@/features/member-counter/queries";
import { verifyGuildAccess } from "@/features/_shared/guild";

export async function saveMemberCounterConfigAction(
    guildId: string,
    data: MemberCounterConfig
): Promise<void> {
    try {
        await verifyGuildAccess(guildId);
        await saveMemberCounterConfig(guildId, data);
        revalidatePath(`/dashboard/${guildId}/member-counter`);
    } catch (error) {
        console.error("Failed to save member counter config:", error);
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0].message);
        }
        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}

export async function setupMemberCounterChannelsAction(
    guildId: string,
    counters: CounterChannel[]
): Promise<AutoCreateResponse> {
    try {
        await verifyGuildAccess(guildId);
        const validCounters = z.array(counterChannelSchema).parse(counters);
        return await setupMemberCounterChannels(guildId, validCounters);
    } catch (error) {
        console.error("Failed to setup member counter channels:", error);
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0].message);
        }
        throw new Error(error instanceof Error ? error.message : "An unexpected error occurred while creating channels.");
    }
}