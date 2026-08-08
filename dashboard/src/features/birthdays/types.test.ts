import { describe, it, expect } from "vitest";
import { BirthdayConfigSchema, SaveBirthdayConfigSchema } from "./types";

describe("Birthday Types & Schemas", () => {
    it("should parse defaults correctly for empty DB input", () => {
        const parsed = BirthdayConfigSchema.parse({});

        expect(parsed.enabled).toBe(false);
        expect(parsed.channelId).toBeNull();
        expect(parsed.birthdayRoleId).toBeNull();
        expect(parsed.announcementHour).toBe(9);
        expect(parsed.timezone).toBe("UTC");
        expect(parsed.messageWithYear.content).toContain("Happy birthday 🎉!");
    });

    describe("announcementHour boundary checks", () => {
        it("should REJECT announcementHour < 0", () => {
            const result = BirthdayConfigSchema.safeParse({ announcementHour: -1 });
            expect(result.success).toBe(false);
        });

        it("should REJECT announcementHour > 23", () => {
            const result = BirthdayConfigSchema.safeParse({ announcementHour: 24 });
            expect(result.success).toBe(false);
        });

        it("should PASS valid boundary hours (0 and 23)", () => {
            expect(BirthdayConfigSchema.safeParse({ announcementHour: 0 }).success).toBe(true);
            expect(BirthdayConfigSchema.safeParse({ announcementHour: 23 }).success).toBe(true);
        });
    });

    it("should allow null channelId when enabled = false (Draft Mode)", () => {
        const draft = {
            enabled: false,
            channelId: null,
        };

        const result = SaveBirthdayConfigSchema.safeParse(draft);
        expect(result.success).toBe(true);
    });

    it("should reject save when enabled = true but channelId is missing", () => {
        const invalid = {
            enabled: true,
            channelId: null,
        };

        const result = SaveBirthdayConfigSchema.safeParse(invalid);
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe(
                "Please select an announcement channel for birthdays!"
            );
        }
    });

    it("should pass save when enabled = true AND valid channelId is set", () => {
        const valid = {
            enabled: true,
            channelId: "channel_999",
        };

        const result = SaveBirthdayConfigSchema.safeParse(valid);
        expect(result.success).toBe(true);
    });
});