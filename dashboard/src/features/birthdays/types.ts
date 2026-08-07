import { z } from "zod";
import { MessageLayoutSchema, isEmbedEmpty } from "@/features/_shared/embed";

export const DEFAULT_BIRTHDAY_MESSAGE = {
    enabled: true,
    format: "TEXT" as const,
    content: "Happy birthday!\n{user.list}!\n🎉",
    embed: {},
};

export const BirthdayConfigSchema = z.object({
    enabled: z.boolean().default(false),
    channelId: z.string().nullish().default(null),
    announcementHour: z.number().min(0).max(23).default(9),
    timezone: z.string().default("UTC"),
    birthdayRoleId: z.string().nullish().default(null),
    requireYear: z.boolean().default(false),

    messageWithYear: MessageLayoutSchema.default(DEFAULT_BIRTHDAY_MESSAGE),
    messageWithoutYear: MessageLayoutSchema.default(DEFAULT_BIRTHDAY_MESSAGE),
});

export const SaveBirthdayConfigSchema = BirthdayConfigSchema.superRefine((data, ctx) => {
    if (data.enabled) {
        if (!data.channelId) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Please select an announcement channel for birthdays!",
                path: ["channelId"],
            });
        }

        // Validate messageWithYear
        if (data.messageWithYear.format === "TEXT" && !data.messageWithYear.content?.trim()) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Birthday message (with year) cannot be empty when format is TEXT!",
                path: ["messageWithYear", "content"],
            });
        }

        // Validate messageWithoutYear
        if (data.messageWithoutYear.format === "TEXT" && !data.messageWithoutYear.content?.trim()) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Birthday message (without year) cannot be empty when format is TEXT!",
                path: ["messageWithoutYear", "content"],
            });
        }
    }
});

export type BirthdayConfig = z.infer<typeof BirthdayConfigSchema>;