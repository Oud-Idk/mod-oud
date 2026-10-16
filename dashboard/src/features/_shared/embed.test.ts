import { describe, expect, it } from "vitest";

import {
    FormatSchema,
    DiscordEmbedSchema,
    messageLayoutSchema,
    TogglableMessageSchema,
    IsoDateSchema,
    isDeepEqual,
    isEmbedEmpty,
} from "./embed";

describe("FormatSchema", () => {
    it("accepts EMBED and TEXT", () => {
        expect(FormatSchema.parse("EMBED")).toBe("EMBED");
        expect(FormatSchema.parse("TEXT")).toBe("TEXT");
    });

    it("rejects other values", () => {
        expect(FormatSchema.safeParse("foo").success).toBe(false);
    });
});

describe("DiscordEmbedSchema", () => {
    it("parses a full embed", () => {
        const parsed = DiscordEmbedSchema.parse({
            title: "t",
            description: "d",
            color: 1,
            fields: [{ name: "n", value: "v", inline: true }],
        });
        expect(parsed.title).toBe("t");
        expect(parsed.fields?.[0].inline).toBe(true);
    });

    it("rejects non-integer color", () => {
        expect(DiscordEmbedSchema.safeParse({ color: 1.5 }).success).toBe(false);
    });
});

describe("isDeepEqual", () => {
    it("treats empty values as equal", () => {
        expect(isDeepEqual(undefined, null)).toBe(true);
        expect(isDeepEqual("", null)).toBe(true);
        expect(isDeepEqual(undefined, "")).toBe(true);
    });

    it("returns false when only one value is empty", () => {
        expect(isDeepEqual(null, { a: 1 })).toBe(false);
        expect(isDeepEqual({ a: 1 }, null)).toBe(false);
        expect(isDeepEqual("", "hello")).toBe(false);
        expect(isDeepEqual(undefined, 42)).toBe(false);
    });

    it("compares primitives", () => {
        expect(isDeepEqual(1, 1)).toBe(true);
        expect(isDeepEqual(1, 2)).toBe(false);
        expect(isDeepEqual("a", "a")).toBe(true);
    });

    it("returns false when comparing an object against a primitive", () => {
        expect(isDeepEqual({ a: 1 }, 1)).toBe(false);
        expect(isDeepEqual(1, { a: 1 })).toBe(false);
        expect(isDeepEqual({ a: 1 }, "str")).toBe(false);
    });

    it("compares separate Date instances for equality and inequality", () => {
        const date1 = new Date("2024-01-01T00:00:00Z");
        const date2 = new Date("2024-01-01T00:00:00Z");
        const diffDate = new Date("2024-01-02T00:00:00Z");

        expect(isDeepEqual(date1, date2)).toBe(true);
        expect(isDeepEqual(date1, diffDate)).toBe(false);
    });

    it("compares Date instances against date strings strictly", () => {
        const date = new Date("2024-01-01T00:00:00Z");
        expect(isDeepEqual(date, "2024-01-01T00:00:00Z")).toBe(true);
        expect(isDeepEqual("2024-01-01T00:00:00Z", date)).toBe(true);

        // Different date string should be false
        expect(isDeepEqual(date, "2024-01-02T00:00:00Z")).toBe(false);
        expect(isDeepEqual("2024-01-02T00:00:00Z", date)).toBe(false);

        // Invalid date string should be false (not throw or coerce to true)
        expect(isDeepEqual(date, "invalid-date-string")).toBe(false);
        expect(isDeepEqual("invalid-date-string", date)).toBe(false);

        // Date vs non-string primitive should be false
        expect(isDeepEqual(date, 12345)).toBe(false);
        expect(isDeepEqual(12345, date)).toBe(false);
    });

    it("compares arrays", () => {
        expect(isDeepEqual([1, 2], [1, 2])).toBe(true);
        expect(isDeepEqual([1, 2], [1, 3])).toBe(false);
        expect(isDeepEqual([1], { 0: 1 })).toBe(false);
    });

    it("treats color zero specially on both sides and preserves other keys", () => {
        expect(isDeepEqual({ color: 0 }, { color: 0 })).toBe(true);
        expect(isDeepEqual({ color: 0 }, {})).toBe(true);
        expect(isDeepEqual({}, { color: 0 })).toBe(true);
        expect(isDeepEqual({ color: 1 }, {})).toBe(false);
        expect(isDeepEqual({}, { color: 1 })).toBe(false);

        // Splicing color 0 must remove "color" and keep other keys intact
        expect(isDeepEqual({ title: "hello", color: 0 }, { title: "hello" })).toBe(true);
        expect(isDeepEqual({ title: "hello" }, { title: "hello", color: 0 })).toBe(true);
    });

    it("compares nested objects", () => {
        expect(isDeepEqual({ a: { b: 2 } }, { a: { b: 2 } })).toBe(true);
        expect(isDeepEqual({ a: { b: 2 } }, { a: { b: 3 } })).toBe(false);
    });

    it("ignores empty values on keys", () => {
        expect(isDeepEqual({ a: 1, b: "" }, { a: 1 })).toBe(true);
        expect(isDeepEqual({ a: 1 }, { a: 1, b: "" })).toBe(true);
    });

    it("fails when object keys differ or key counts differ", () => {
        // Same count, different keys
        expect(isDeepEqual({ a: 1 }, { b: 1 })).toBe(false);

        // Different count of valid keys
        expect(isDeepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
        expect(isDeepEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false);
    });
});

describe("isEmbedEmpty", () => {
    it("returns true for an empty embed", () => {
        expect(isEmbedEmpty({})).toBe(true);
    });

    it("returns false when any content exists", () => {
        expect(isEmbedEmpty({ title: "t" })).toBe(false);
        expect(isEmbedEmpty({ description: "d" })).toBe(false);
        expect(isEmbedEmpty({ fields: [{ name: "n", value: "v" }] })).toBe(false);
        expect(isEmbedEmpty({ author: { name: "a" } })).toBe(false);
        expect(isEmbedEmpty({ footer: { text: "f" } })).toBe(false);
        expect(isEmbedEmpty({ image: { url: "u" } })).toBe(false);
        expect(isEmbedEmpty({ thumbnail: { url: "u" } })).toBe(false);
    });

    it("returns true when fields array is empty", () => {
        expect(isEmbedEmpty({ fields: [] })).toBe(true);
    });

    it("ignores whitespace-only strings across all fields", () => {
        expect(isEmbedEmpty({ title: "   " })).toBe(true);
        expect(isEmbedEmpty({ description: "   " })).toBe(true);
        expect(isEmbedEmpty({ author: { name: "   " } })).toBe(true);
        expect(isEmbedEmpty({ footer: { text: "   " } })).toBe(true);
        expect(isEmbedEmpty({ image: { url: "   " } })).toBe(true);
        expect(isEmbedEmpty({ thumbnail: { url: "   " } })).toBe(true);
    });
});

describe("messageLayoutSchema", () => {
    it("requires text content in TEXT format and adds exact issue details", () => {
        const result = messageLayoutSchema.safeParse({
            format: "TEXT",
            content: "   ",
            embed: {},
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].code).toBe("custom");
            expect(result.error.issues[0].path).toEqual(["content"]);
            expect(result.error.issues[0].message).toBe(
                "Message content cannot be empty when format is set to TEXT!"
            );
        }
    });

    it("accepts non-empty text content", () => {
        const result = messageLayoutSchema.safeParse({
            format: "TEXT",
            content: "hi",
            embed: {},
        });
        expect(result.success).toBe(true);
    });

    it("requires embed content in EMBED format and adds exact issue details", () => {
        const result = messageLayoutSchema.safeParse({
            format: "EMBED",
            content: "",
            embed: {},
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].code).toBe("custom");
            expect(result.error.issues[0].path).toEqual(["embed"]);
            expect(result.error.issues[0].message).toBe(
                "Embed must have a title, description, or fields when format is set to EMBED!"
            );
        }
    });

    it("accepts a non-empty embed", () => {
        const result = messageLayoutSchema.safeParse({
            format: "EMBED",
            content: "",
            embed: { title: "t" },
        });
        expect(result.success).toBe(true);
    });
});

describe("TogglableMessageSchema", () => {
    it("defaults enabled to false when omitted", () => {
        const parsed = TogglableMessageSchema.parse({});
        expect(parsed.enabled).toBe(false);
    });

    it("defaults when disabled", () => {
        const parsed = TogglableMessageSchema.parse({ enabled: false });
        expect(parsed.enabled).toBe(false);
    });

    it("validates message only when enabled and attaches full path prefix", () => {
        const disabled = TogglableMessageSchema.safeParse({
            enabled: false,
            message: { format: "TEXT", content: "", embed: {} },
        });
        expect(disabled.success).toBe(true);

        const enabled = TogglableMessageSchema.safeParse({
            enabled: true,
            message: { format: "TEXT", content: "", embed: {} },
        });
        expect(enabled.success).toBe(false);
        if (!enabled.success) {
            expect(enabled.error.issues[0].code).toBe("custom");
            expect(enabled.error.issues[0].path).toEqual(["message", "content"]);
        }

        const enabledEmbed = TogglableMessageSchema.safeParse({
            enabled: true,
            message: { format: "EMBED", content: "", embed: {} },
        });
        expect(enabledEmbed.success).toBe(false);
        if (!enabledEmbed.success) {
            expect(enabledEmbed.error.issues[0].code).toBe("custom");
            expect(enabledEmbed.error.issues[0].path).toEqual(["message", "embed"]);
        }
    });
});

describe("IsoDateSchema", () => {
    it("coerces dates and strings", () => {
        expect(IsoDateSchema.parse("2024-01-01")).toBeInstanceOf(Date);
        expect(IsoDateSchema.parse(new Date("2024-01-01"))).toBeInstanceOf(Date);
    });
});