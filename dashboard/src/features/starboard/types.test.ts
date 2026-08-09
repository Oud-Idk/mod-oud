import { describe, it, expect } from "vitest";
import { starboardConfigInputSchema, starboardConfigSchema } from "./types";

describe("starboardConfigInputSchema", () => {
    it("should apply defaults when optional fields are omitted", () => {
        const parsed = starboardConfigInputSchema.parse({
            starboard_channel_id: "chan_1",
        });

        expect(parsed.id).toBeUndefined();
        expect(parsed.emojis).toEqual(["⭐"]);
        expect(parsed.reaction_threshold).toBe(3);
        expect(parsed.min_message_age).toBeNull();
        expect(parsed.max_message_age).toBeNull();
        expect(parsed.prevent_self_star).toBe(true);
        expect(parsed.allow_bot_messages).toBe(false);
        expect(parsed.role_restriction_type).toBe("NONE");
        expect(parsed.restricted_roles).toEqual([]);
        expect(parsed.channel_restriction_type).toBe("NONE");
        expect(parsed.restricted_channels).toEqual([]);
        expect(parsed.embed_template).toEqual({});
        expect(parsed.plaintext_template).toBe("");
        expect(parsed.keep_deleted_messages).toBe(true);
    });

    it("should PASS a fully configured starboard", () => {
        const result = starboardConfigInputSchema.safeParse({
            starboard_channel_id: "chan_1",
            emojis: ["⭐", "🌟"],
            reaction_threshold: 5,
            min_message_age: "1 hour",
            max_message_age: "7 days",
            embed_template: { title: "Starred", color: 16776960 },
        });

        expect(result.success).toBe(true);
    });

    it("should REJECT when starboard_channel_id is missing", () => {
        const result = starboardConfigInputSchema.safeParse({});

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe(
                "Please select a destination channel for the starboard."
            );
            expect(result.error.issues[0].path).toEqual(["starboard_channel_id"]);
        }
    });

    it("should REJECT when starboard_channel_id is an empty string", () => {
        const result = starboardConfigInputSchema.safeParse({ starboard_channel_id: " " });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe(
                "Please select a destination channel for the starboard."
            );
            expect(result.error.issues[0].path).toEqual(["starboard_channel_id"]);
        }
    });

    it("should REJECT an empty emojis array", () => {
        const result = starboardConfigInputSchema.safeParse({
            starboard_channel_id: "chan_1",
            emojis: [],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe("At least one reaction emoji is required.");
            expect(result.error.issues[0].path).toEqual(["emojis"]);
        }
    });

    it("should REJECT a reaction_threshold below 1", () => {
        const result = starboardConfigInputSchema.safeParse({
            starboard_channel_id: "chan_1",
            reaction_threshold: 0,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe("Threshold must be at least 1");
        }
    });

    it("should PASS a reaction_threshold of exactly 1", () => {
        expect(
            starboardConfigInputSchema.safeParse({
                starboard_channel_id: "chan_1",
                reaction_threshold: 1,
            }).success
        ).toBe(true);
    });

    describe("message age interval validation", () => {
        it("should accept valid interval strings", () => {
            expect(
                starboardConfigInputSchema.safeParse({
                    starboard_channel_id: "chan_1",
                    min_message_age: "30 minutes",
                    max_message_age: "90 days",
                }).success
            ).toBe(true);
        });

        it("should allow null message ages", () => {
            expect(
                starboardConfigInputSchema.safeParse({
                    starboard_channel_id: "chan_1",
                    min_message_age: null,
                    max_message_age: null,
                }).success
            ).toBe(true);
        });

        it("should accept singular, zero, and mixed-unit intervals", () => {
            const valid = ["1 hour", "0 days", "1 hour 30 minutes", "2 days 3 hours"];
            for (const value of valid) {
                expect(
                    starboardConfigInputSchema.safeParse({
                        starboard_channel_id: "chan_1",
                        min_message_age: value,
                    }).success
                ).toBe(true);
            }
        });

        it("should accept intervals case-insensitively", () => {
            expect(
                starboardConfigInputSchema.safeParse({
                    starboard_channel_id: "chan_1",
                    min_message_age: "1 HOUR",
                }).success
            ).toBe(true);
        });

        it("should accept intervals with extra or trailing whitespace", () => {
            const valid = [" 1 hour ", "1  hour  30  minutes ", "30 minutes  "];
            for (const value of valid) {
                expect(
                    starboardConfigInputSchema.safeParse({
                        starboard_channel_id: "chan_1",
                        min_message_age: value,
                    }).success
                ).toBe(true);
            }
        });

        it("should accept empty and whitespace-only message ages", () => {
            const valid = ["", "   "];
            for (const value of valid) {
                expect(
                    starboardConfigInputSchema.safeParse({
                        starboard_channel_id: "chan_1",
                        min_message_age: value,
                    }).success
                ).toBe(true);
            }
        });

        it("should reject an invalid min_message_age format", () => {
            const result = starboardConfigInputSchema.safeParse({
                starboard_channel_id: "chan_1",
                min_message_age: "banana",
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toContain("Invalid min message age format");
                expect(result.error.issues[0].path).toEqual(["min_message_age"]);
            }
        });

        it("should reject an invalid max_message_age format", () => {
            const result = starboardConfigInputSchema.safeParse({
                starboard_channel_id: "chan_1",
                max_message_age: "30 min",
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toContain("Invalid max message age format");
                expect(result.error.issues[0].path).toEqual(["max_message_age"]);
            }
        });

        it("should reject intervals with leading or trailing garbage", () => {
            const invalid = ["1 hour extra", "x 1 hour"];
            for (const value of invalid) {
                expect(
                    starboardConfigInputSchema.safeParse({
                        starboard_channel_id: "chan_1",
                        min_message_age: value,
                    }).success
                ).toBe(false);
            }
        });

        it("should reject malformed amounts and units", () => {
            const invalid = ["1hour", "1.5 hours", "-1 hour"];
            for (const value of invalid) {
                expect(
                    starboardConfigInputSchema.safeParse({
                        starboard_channel_id: "chan_1",
                        min_message_age: value,
                    }).success
                ).toBe(false);
            }
        });
    });

    it("should REJECT an unknown role_restriction_type", () => {
        const result = starboardConfigInputSchema.safeParse({
            starboard_channel_id: "chan_1",
            role_restriction_type: "EVERYONE",
        });

        expect(result.success).toBe(false);
    });

    it("should REJECT an unknown channel_restriction_type", () => {
        const result = starboardConfigInputSchema.safeParse({
            starboard_channel_id: "chan_1",
            channel_restriction_type: "RANDOM",
        });

        expect(result.success).toBe(false);
    });

    it("should accept all valid role_restriction_type values", () => {
        for (const value of ["NONE", "ALL_EXCEPT", "ONLY_THESE"]) {
            expect(
                starboardConfigInputSchema.safeParse({
                    starboard_channel_id: "chan_1",
                    role_restriction_type: value,
                }).success
            ).toBe(true);
        }
    });

    it("should accept all valid channel_restriction_type values", () => {
        for (const value of ["NONE", "ALL_EXCEPT", "ONLY_THESE"]) {
            expect(
                starboardConfigInputSchema.safeParse({
                    starboard_channel_id: "chan_1",
                    channel_restriction_type: value,
                }).success
            ).toBe(true);
        }
    });

    it("should coerce a string id to a number", () => {
        const parsed = starboardConfigInputSchema.parse({
            id: "42",
            starboard_channel_id: "chan_1",
        });

        expect(parsed.id).toBe("42");
    });
});

describe("starboardConfigSchema (DB rows)", () => {
    it("should parse a full DB row and coerce string timestamps", () => {
        const result = starboardConfigSchema.safeParse({
            id: "1",
            guild_id: "guild_123",
            starboard_channel_id: "chan_1",
            emojis: ["⭐"],
            reaction_threshold: 3,
            min_message_age: null,
            max_message_age: null,
            prevent_self_star: true,
            allow_bot_messages: false,
            role_restriction_type: "NONE",
            restricted_roles: [],
            channel_restriction_type: "NONE",
            restricted_channels: [],
            embed_template: {},
            plaintext_template: "",
            keep_deleted_messages: true,
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-02T00:00:00.000Z",
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.id).toBe("1");
            expect(result.data.created_at).toBe("2026-01-01T00:00:00.000Z");
            expect(result.data.updated_at).toBe("2026-01-02T00:00:00.000Z");
        }
    });

    it("should reject a row with an unknown restriction enum", () => {
        const result = starboardConfigSchema.safeParse({
            id: "1",
            guild_id: "guild_123",
            starboard_channel_id: "chan_1",
            emojis: ["⭐"],
            reaction_threshold: 3,
            role_restriction_type: "INVALID",
            channel_restriction_type: "NONE",
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-02T00:00:00.000Z",
        });

        expect(result.success).toBe(false);
    });

    it("should apply defaults when optional fields are omitted from a DB row", () => {
        const parsed = starboardConfigSchema.parse({
            id: "1",
            guild_id: "guild_123",
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-02T00:00:00.000Z",
        });

        expect(parsed.starboard_channel_id).toBeNull();
        expect(parsed.emojis).toEqual(["⭐"]);
        expect(parsed.reaction_threshold).toBe(3);
        expect(parsed.min_message_age).toBeNull();
        expect(parsed.max_message_age).toBeNull();
        expect(parsed.prevent_self_star).toBe(true);
        expect(parsed.allow_bot_messages).toBe(false);
        expect(parsed.role_restriction_type).toBe("NONE");
        expect(parsed.restricted_roles).toEqual([]);
        expect(parsed.channel_restriction_type).toBe("NONE");
        expect(parsed.restricted_channels).toEqual([]);
        expect(parsed.embed_template).toEqual({});
        expect(parsed.plaintext_template).toBe("");
        expect(parsed.keep_deleted_messages).toBe(true);
    });

    it("should accept all valid restriction enum values from a DB row", () => {
        for (const value of ["NONE", "ALL_EXCEPT", "ONLY_THESE"]) {
            expect(
                starboardConfigSchema.safeParse({
                    id: "1",
                    guild_id: "guild_123",
                    role_restriction_type: value,
                    channel_restriction_type: value,
                    created_at: "2026-01-01T00:00:00.000Z",
                    updated_at: "2026-01-02T00:00:00.000Z",
                }).success
            ).toBe(true);
        }
    });
});
