import { z } from "zod";

import { DiscordEmbed } from "@/features/_shared/embed";

export const messageFormatSchema = z.enum(["EMBED", "TEXT"]);

export const dmTemplateSettingSchema = z.object({
    enabled: z.boolean().default(false),
    content: z.string().default(""),
    embed: z.custom<DiscordEmbed>().optional().default({}),
    format: messageFormatSchema.default("TEXT"),
});

const defaultTemplate = {
    enabled: false,
    content: "",
    embed: {},
    format: "TEXT" as const,
};

export const moderationDMsInputSchema = z.object({
    warn: dmTemplateSettingSchema.default(defaultTemplate),
    pardonWarn: dmTemplateSettingSchema.default(defaultTemplate),
    unpardonWarn: dmTemplateSettingSchema.default(defaultTemplate),
    unpardonDeleteWarn: dmTemplateSettingSchema.default(defaultTemplate),
    mute: dmTemplateSettingSchema.default(defaultTemplate),
    unmute: dmTemplateSettingSchema.default(defaultTemplate),
    kick: dmTemplateSettingSchema.default(defaultTemplate),
    ban: dmTemplateSettingSchema.default(defaultTemplate),
    softban: dmTemplateSettingSchema.default(defaultTemplate),
    honeypot: dmTemplateSettingSchema.default(defaultTemplate),
});

export const moderationDMsConfigSchema = moderationDMsInputSchema;

export type DMTemplateSetting = z.infer<typeof dmTemplateSettingSchema>;
export type ModerationDMsInput = z.input<typeof moderationDMsInputSchema>;
export type ModerationDMsConfig = z.infer<typeof moderationDMsConfigSchema>;