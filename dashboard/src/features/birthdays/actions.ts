"use server";

import { BirthdayConfig } from "@/features/birthdays/types";
import { saveBirthdayConfig } from "@/features/birthdays/queries";
import { revalidatePath } from "next/cache";

import { verifyGuildAccess } from "@/features/_shared/guild";

export async function saveBirthdayConfigAction(guildId: string, data: BirthdayConfig): Promise<void> {
    try {
        await verifyGuildAccess(guildId);
        await saveBirthdayConfig(guildId, data);
        revalidatePath(`/dashboard/${guildId}/birthdays`);
    } catch (error) {
        console.error("Failed to save birthday config:", error);
        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}