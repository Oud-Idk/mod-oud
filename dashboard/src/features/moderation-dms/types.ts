import { z } from "zod";
import { TogglableMessageSchema } from "@/features/_shared/embed";

export const DEFAULT_DM_TEMPLATE = {
    enabled: false,
    message: {
        format: "TEXT" as const,
        content: "",
        embed: {},
    }
};

export const dmTemplateSettingSchema = TogglableMessageSchema.default(DEFAULT_DM_TEMPLATE);

export const moderationDMsConfigSchema = z.object({
    warn: dmTemplateSettingSchema,
    pardonWarn: dmTemplateSettingSchema,
    unpardonWarn: dmTemplateSettingSchema,
    unpardonDeleteWarn: dmTemplateSettingSchema,
    mute: dmTemplateSettingSchema,
    unmute: dmTemplateSettingSchema,
    kick: dmTemplateSettingSchema,
    ban: dmTemplateSettingSchema,
    softban: dmTemplateSettingSchema,
    honeypot: dmTemplateSettingSchema,
});

export type DMTemplateSetting = z.infer<typeof dmTemplateSettingSchema>;
export type ModerationDMsConfig = z.infer<typeof moderationDMsConfigSchema>;

export const defaultModerationDMsConfig: ModerationDMsConfig = moderationDMsConfigSchema.parse({});