"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { getGuildChannels } from "@/features/_shared/channels";
import { deleteReminder, saveReminder } from "./queries";
import { saveableReminderSchema, type ReminderRow, type SaveableReminderInput } from "./types";

export async function saveReminderAction(
    guildId: string,
    rawReminder: SaveableReminderInput
): Promise<ReminderRow> {
    try {
        await verifyGuildAccess(guildId);

        const validatedInput = saveableReminderSchema.parse(rawReminder);

        // The worker sends to this channel with the bot's credentials, so it has to belong to the
        // guild that was authorized. Without this a manager could post into another guild.
        const guildChannelIds = new Set(
            (await getGuildChannels(guildId)).map((channel) => channel.id)
        );
        if (guildChannelIds.size === 0) {
            throw new Error("Could not read this server's channels. Try again.");
        }
        if (validatedInput.channelId === null || !guildChannelIds.has(validatedInput.channelId)) {
            throw new Error("That channel does not belong to this server.");
        }

        const savedRow = await saveReminder(guildId, validatedInput);

        revalidatePath(`/dashboard/${guildId}/reminders`);
        return savedRow;
    } catch (error) {
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0].message);
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

        await deleteReminder(guildId, id, channelId);
        revalidatePath(`/dashboard/${guildId}/reminders`);
    } catch (error) {
        console.error(`Failed to delete reminder ${id} for guild ${guildId}:`, error);
        throw new Error(error instanceof Error ? error.message : "Could not delete reminder.");
    }
}