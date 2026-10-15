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

    it("compares primitives", () => {
        expect(isDeepEqual(1, 1)).toBe(true);
        expect(isDeepEqual(1, 2)).toBe(false);
        expect(isDeepEqual("a", "a")).toBe(true);
    });

    it("compares dates and date strings", () => {
        const date = new Date("2024-01-01");
        expect(isDeepEqual(date, "2024-01-01")).toBe(true);
        expect(isDeepEqual("2024-01-01", date)).toBe(true);
        expect(isDeepEqual(date, date)).toBe(true);
    });

    it("compares arrays", () => {
        expect(isDeepEqual([1, 2], [1, 2])).toBe(true);
        expect(isDeepEqual([1, 2], [1, 3])).toBe(false);
        expect(isDeepEqual([1], { 0: 1 })).toBe(false);
    });

    it("treats color zero specially", () => {
        expect(isDeepEqual({ color: 0 }, { color: 0 })).toBe(true);
        expect(isDeepEqual({ color: 0 }, {})).toBe(true);
        expect(isDeepEqual({ color: 1 }, {})).toBe(false);
    });

    it("compares nested objects", () => {
        expect(isDeepEqual({ a: { b: 2 } }, { a: { b: 2 } })).toBe(true);
        expect(isDeepEqual({ a: { b: 2 } }, { a: { b: 3 } })).toBe(false);
    });

    it("ignores empty values on keys", () => {
        expect(isDeepEqual({ a: 1, b: "" }, { a: 1 })).toBe(true);
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

    it("ignores whitespace-only strings", () => {
        expect(isEmbedEmpty({ title: "   " })).toBe(true);
    });
});

describe("messageLayoutSchema", () => {
    it("requires text content in TEXT format", () => {
        const result = messageLayoutSchema.safeParse({
            format: "TEXT",
            content: "",
            embed: {},
        });
        expect(result.success).toBe(false);
    });

    it("accepts non-empty text content", () => {
        const result = messageLayoutSchema.safeParse({
            format: "TEXT",
            content: "hi",
            embed: {},
        });
        expect(result.success).toBe(true);
    });

    it("requires embed content in EMBED format", () => {
        const result = messageLayoutSchema.safeParse({
            format: "EMBED",
            content: "",
            embed: {},
        });
        expect(result.success).toBe(false);
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
    it("defaults when disabled", () => {
        const parsed = TogglableMessageSchema.parse({ enabled: false });
        expect(parsed.enabled).toBe(false);
    });

    it("validates message only when enabled", () => {
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
    });
});

describe("IsoDateSchema", () => {
    it("coerces dates and strings", () => {
        expect(IsoDateSchema.parse("2024-01-01")).toBeInstanceOf(Date);
        expect(IsoDateSchema.parse(new Date("2024-01-01"))).toBeInstanceOf(Date);
    });
});
