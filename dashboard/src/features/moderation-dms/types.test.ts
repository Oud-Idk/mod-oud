import { describe, it, expect } from "vitest";
import {
    moderationDMsConfigSchema,
    dmTemplateSettingSchema,
    defaultModerationDMsConfig,
    DEFAULT_DM_TEMPLATE,
} from "./types";

describe("dmTemplateSettingSchema", () => {
    it("should apply the default template when omitted", () => {
        const parsed = dmTemplateSettingSchema.parse(undefined);

        expect(parsed.enabled).toBe(false);
        expect(parsed.message.format).toBe("TEXT");
        expect(parsed.message.content).toBe("");
        expect(parsed.message.embed).toEqual({});
    });

    it("should accept an enabled TEXT template with content", () => {
        const result = dmTemplateSettingSchema.safeParse({
            enabled: true,
            message: { format: "TEXT", content: "You were muted", embed: {} },
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.enabled).toBe(true);
            expect(result.data.message.content).toBe("You were muted");
        }
    });

    it("should REJECT an empty TEXT template when provided explicitly", () => {
        const result = dmTemplateSettingSchema.safeParse({
            enabled: true,
            message: { format: "TEXT", content: "", embed: {} },
        });

        expect(result.success).toBe(false);
    });

    it("should REJECT an EMBED template with no embed content", () => {
        const result = dmTemplateSettingSchema.safeParse({
            enabled: true,
            message: { format: "EMBED", content: "", embed: {} },
        });

        expect(result.success).toBe(false);
    });

    it("should accept a populated EMBED template", () => {
        const result = dmTemplateSettingSchema.safeParse({
            enabled: true,
            message: {
                format: "EMBED",
                content: "",
                embed: { title: "Muted" },
            },
        });

        expect(result.success).toBe(true);
    });
});

describe("moderationDMsConfigSchema", () => {
    it("should apply the default template to all ten fields when parsed from an empty object", () => {
        const parsed = moderationDMsConfigSchema.parse({});

        expect(parsed.warn).toEqual(DEFAULT_DM_TEMPLATE);
        expect(parsed.pardonWarn).toEqual(DEFAULT_DM_TEMPLATE);
        expect(parsed.unpardonWarn).toEqual(DEFAULT_DM_TEMPLATE);
        expect(parsed.unpardonDeleteWarn).toEqual(DEFAULT_DM_TEMPLATE);
        expect(parsed.mute).toEqual(DEFAULT_DM_TEMPLATE);
        expect(parsed.unmute).toEqual(DEFAULT_DM_TEMPLATE);
        expect(parsed.kick).toEqual(DEFAULT_DM_TEMPLATE);
        expect(parsed.ban).toEqual(DEFAULT_DM_TEMPLATE);
        expect(parsed.softban).toEqual(DEFAULT_DM_TEMPLATE);
        expect(parsed.honeypot).toEqual(DEFAULT_DM_TEMPLATE);
    });

    it("should keep provided per-action templates", () => {
        const parsed = moderationDMsConfigSchema.parse({
            mute: {
                enabled: true,
                message: { format: "TEXT", content: "Muted for spamming", embed: {} },
            },
        });

        expect(parsed.mute.enabled).toBe(true);
        expect(parsed.mute.message.content).toBe("Muted for spamming");
        expect(parsed.ban.enabled).toBe(false);
    });

    it("should REJECT a config with an invalid template for one action", () => {
        const result = moderationDMsConfigSchema.safeParse({
            kick: {
                enabled: true,
                message: { format: "TEXT", content: "", embed: {} },
            },
        });

        expect(result.success).toBe(false);
    });
});

describe("defaultModerationDMsConfig", () => {
    it("should expose the parsed defaults", () => {
        expect(defaultModerationDMsConfig.warn.enabled).toBe(false);
        expect(defaultModerationDMsConfig.mute.message.format).toBe("TEXT");
        expect(Object.keys(defaultModerationDMsConfig)).toHaveLength(10);
    });
});
