import { z } from "zod";

import { DiscordEmbed } from "@/features/_shared/embed";

export const reminderFormatSchema = z.enum(["EMBED", "TEXT"]);
export const reminderTypeSchema = z.enum(["SINGLE", "RECURRING"]);

export const saveableReminderSchema = z.object({
    id: z.string().optional(),
    channelId: z.string().min(1, "Channel is required"),
    format: reminderFormatSchema.default("TEXT"),
    embed: z.custom<DiscordEmbed>().nullable().optional().default(null),
    content: z.string().nullable().optional().default(""),
    rType: reminderTypeSchema.default("SINGLE"),
    nextTriggerAt: z.string().default(() => new Date().toISOString()),
    daysOfWeek: z.array(z.number()).nullable().optional().default([]),
    timeStart: z.string().nullable().optional().default(null),
    timeEnd: z.string().nullable().optional().default(null),
    intervalSeconds: z.number().nullable().optional().default(null),
    isActive: z.boolean().default(true),
});

export const reminderRowSchema = saveableReminderSchema.extend({
    id: z.string(),
});

export type ReminderFormat = z.infer<typeof reminderFormatSchema>;
export type ReminderType = z.infer<typeof reminderTypeSchema>;
export type SaveableReminder = z.input<typeof saveableReminderSchema>;
export type ReminderRow = z.infer<typeof reminderRowSchema>;
export type Reminder = ReminderRow;