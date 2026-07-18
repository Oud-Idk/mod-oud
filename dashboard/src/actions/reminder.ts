"use server";

import { revalidatePath } from "next/cache";
import { deleteReminder, ReminderRow, SaveableReminder, saveReminder } from "@/utils/db/reminder";

export async function saveReminderAction(
    guildId: string,
    reminder: SaveableReminder
): Promise<ReminderRow> {
    try {
        const savedRow = await saveReminder(reminder);
        revalidatePath(`/dashboard/${guildId}/reminders`);
        return savedRow;
    } catch (error) {
        console.error(`Failed to save reminder for guild ${guildId}:`, error);
        throw new Error("Could not save reminder. Please verify inputs and try again.");
    }
}

export async function deleteReminderAction(
    guildId: string,
    id: string,
    channelId: string
): Promise<void> {
    try {
        await deleteReminder(id, channelId);
        revalidatePath(`/dashboard/${guildId}/reminders`);
    } catch (error) {
        console.error(`Failed to delete reminder ${id} for guild ${guildId}:`, error);
        throw new Error("Could not delete reminder. Please try again.");
    }
}