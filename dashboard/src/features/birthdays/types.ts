import { z } from "zod";
import { messageLayoutSchema } from "@/features/_shared/embed";

export const DEFAULT_BIRTHDAY_MESSAGE = {
    enabled: true,
    format: "TEXT" as const,
    content: "Happy birthday 🎉!\n{user.list}!",
    embed: {},
};

export const BirthdayConfigSchema = z.object({
    enabled: z.boolean().default(false),
    channelId: z.string().nullish().default(null),
    announcementHour: z.number().min(0).max(23).default(9),
    timezone: z.string().default("UTC"),
    birthdayRoleId: z.string().nullish().default(null),
    requireYear: z.boolean().default(false),

    messageWithYear: messageLayoutSchema.default(DEFAULT_BIRTHDAY_MESSAGE),
    messageWithoutYear: messageLayoutSchema.default(DEFAULT_BIRTHDAY_MESSAGE),
});

export const SaveBirthdayConfigSchema = BirthdayConfigSchema.superRefine((data, ctx) => {
    if (data.enabled && !data.channelId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Please select an announcement channel for birthdays!",
            path: ["channelId"],
        });
    }
});

export type BirthdayConfig = z.infer<typeof BirthdayConfigSchema>;