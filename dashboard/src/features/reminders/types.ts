import { z } from "zod";
import {
    DEFAULT_MESSAGE_LAYOUT,
    messageLayoutSchema,
} from "@/features/_shared/embed";

export const reminderFormatSchema = z.enum(["EMBED", "TEXT"]).default("TEXT");
export const reminderTypeSchema = z.enum(["SINGLE", "RECURRING"]).default("SINGLE");

export const reminderBaseSchema = z.object({
    id: z.string().optional(),
    channelId: z.string().nullish().default(null),
    message: messageLayoutSchema.default(DEFAULT_MESSAGE_LAYOUT),

    rType: reminderTypeSchema,

    nextTriggerAt: z.date().default(() => new Date()),
    daysOfWeek: z.array(z.number()).nullish().default(null),
    timeStart: z.string().nullish().default(null),
    timeEnd: z.string().nullish().default(null),
    intervalSeconds: z.number().nullish().default(null),

    isActive: z.boolean().default(true),
});

export const saveableReminderSchema = reminderBaseSchema.superRefine((data, ctx) => {
    if (!data.channelId || data.channelId.trim() === "") {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Please select a target channel.",
            path: ["channelId"],
        });
    }

    if (data.message.format === "TEXT" && (!data.message.content || data.message.content.trim() === "")) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Message content cannot be empty for plain text format.",
            path: ["message", "content"],
        });
    }

    if (data.rType === "RECURRING") {
        if (!data.timeStart && !data.intervalSeconds && (!data.daysOfWeek || data.daysOfWeek.length === 0)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Recurring reminders require a start time, interval, or active days.",
                path: ["rType"],
            });
        }
    }
});

export const reminderRowSchema = reminderBaseSchema.extend({
    id: z.string(),
});

export type ReminderFormat = z.infer<typeof reminderFormatSchema>;
export type ReminderType = z.infer<typeof reminderTypeSchema>;
export type SaveableReminderInput = z.input<typeof saveableReminderSchema>;
export type SaveableReminder = z.infer<typeof saveableReminderSchema>;
export type ReminderRow = z.infer<typeof reminderRowSchema>;
export type Reminder = ReminderRow;