import { z } from "zod";
import { MessageLayoutSchema } from "@/features/_shared/embed";

export const DEFAULT_LEAVE_MESSAGE = {
    enabled: true,
    format: "EMBED" as const,
    content: "",
    embed: {},
};

export const leaveConfigSchema = z.object({
    enabled: z.boolean().default(false),
    channelId: z.string().nullish().default(null),
    message: MessageLayoutSchema.default(DEFAULT_LEAVE_MESSAGE),
});

export const saveLeaveConfigSchema = leaveConfigSchema.superRefine((data, ctx) => {
    if (data.enabled && !data.channelId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Please select a channel for leave messages!",
            path: ["channelId"],
        });
    }
});

export type LeaveConfig = z.infer<typeof leaveConfigSchema>;
export const defaultLeaveConfig: LeaveConfig = leaveConfigSchema.parse({});