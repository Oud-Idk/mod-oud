"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { deleteReminder, saveReminder } from "./queries";
import { saveableReminderSchema, type ReminderRow, type SaveableReminderInput } from "./types";

export async function saveReminderAction(
    guildId: string,
    rawReminder: SaveableReminderInput
): Promise<ReminderRow> {
    try {
        await verifyGuildAccess(guildId);

        const validatedInput = saveableReminderSchema.parse(rawReminder);
        const savedRow = await saveReminder(validatedInput);

        revalidatePath(`/dashboard/${guildId}/reminders`);
        return savedRow;
    } catch (error) {
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0]?.message || "Invalid reminder configuration.");
        }
        console.error(`Failed to save reminder for guild ${guildId}:`, error);
        throw new Error(error instanceof Error ? error.message : "Could not save reminder.");
    }
}

export async function deleteReminderAction(
    guildId: string,
    id: string,
    channelId: string | null
): Promise<void> {
    try {
        await verifyGuildAccess(guildId);

        await deleteReminder(id, channelId);
        revalidatePath(`/dashboard/${guildId}/reminders`);
    } catch (error) {
        console.error(`Failed to delete reminder ${id} for guild ${guildId}:`, error);
        throw new Error(error instanceof Error ? error.message : "Could not delete reminder.");
    }
}