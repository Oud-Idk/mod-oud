"use server";

import { BirthdayConfig, SaveBirthdayConfigSchema } from "@/features/birthdays/types";
import { saveBirthdayConfig } from "@/features/birthdays/queries";
import { revalidatePath } from "next/cache";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { z } from "zod";

export async function saveBirthdayConfigAction(guildId: string, data: BirthdayConfig): Promise<void> {
    try {
        await verifyGuildAccess(guildId);

        const validatedData = SaveBirthdayConfigSchema.parse(data);

        await saveBirthdayConfig(guildId, validatedData);
        revalidatePath(`/dashboard/${guildId}/birthdays`);
    } catch (error) {
        console.error("Failed to save birthday config:", error);

        if (error instanceof z.ZodError) {
            const firstErrorMessage = error.issues[0]?.message || "Validation Error";
            throw new Error(firstErrorMessage);
        }

        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}