import { describe, it, expect } from "vitest";
import {
    giveawaySchema,
    saveGiveawayInputSchema,
    SaveGiveawaySchema,
    sendGiveawayInputSchema,
    sendGiveawayResponseSchema,
    DEFAULT_GIVEAWAY_MESSAGE,
    type SaveGiveawayData,
} from "./types";

describe("saveGiveawayInputSchema (draft mode)", () => {
    it("should apply defaults when optional fields are omitted", () => {
        const parsed = saveGiveawayInputSchema.parse({
            guild_id: "guild_123",
            host_id: "user_123",
            prize: "Nitro",
            end_time: "2026-12-31T23:59:59.000Z",
        });

        expect(parsed.winner_count).toBe(1);
        expect(parsed.channel_id).toBeNull();
        expect(parsed.message_id).toBeNull();
        expect(parsed.id).toBeUndefined();
        expect(parsed.message).toEqual(DEFAULT_GIVEAWAY_MESSAGE);
    });

    it("should coerce numeric strings for id and winner_count", () => {
        const parsed = saveGiveawayInputSchema.parse({
            id: "7",
            guild_id: "guild_123",
            host_id: "user_123",
            prize: "Nitro",
            winner_count: "3",
            end_time: "2026-12-31T23:59:59.000Z",
        });

        expect(parsed.id).toBe(7);
        expect(parsed.winner_count).toBe(3);
    });

    it("should keep end_time as a Date", () => {
        const parsed = saveGiveawayInputSchema.parse({
            guild_id: "guild_123",
            host_id: "user_123",
            prize: "Nitro",
            end_time: new Date("2026-01-01T00:00:00.000Z"),
        });

        expect(parsed.end_time).toEqual(new Date("2026-01-01T00:00:00.000Z"));
    });

    it("should reject when prize is missing", () => {
        expect(() =>
            saveGiveawayInputSchema.parse({
                guild_id: "guild_123",
                host_id: "user_123",
                end_time: "2026-12-31T23:59:59.000Z",
            })
        ).toThrow();
    });

    it("should reject when end_time is missing", () => {
        expect(() =>
            saveGiveawayInputSchema.parse({
                guild_id: "guild_123",
                host_id: "user_123",
                prize: "Nitro",
            })
        ).toThrow();
    });

    it("should reject an empty prize string", () => {
        expect(() =>
            saveGiveawayInputSchema.parse({
                guild_id: "guild_123",
                host_id: "user_123",
                prize: "",
                end_time: "2026-12-31T23:59:59.000Z",
            })
        ).toThrow("Prize description is required");
    });
});

describe("SaveGiveawaySchema (strict save validation)", () => {
    const validSavePayload = (): SaveGiveawayData =>
        saveGiveawayInputSchema.parse({
            guild_id: "guild_123",
            host_id: "user_123",
            channel_id: "chan_1",
            prize: "Nitro",
            winner_count: 2,
            end_time: "2026-12-31T23:59:59.000Z",
        });

    it("should pass a fully configured giveaway", () => {
        expect(() => SaveGiveawaySchema.parse(validSavePayload())).not.toThrow();
    });

    it("should reject when prize is only whitespace", () => {
        const payload = { ...validSavePayload(), prize: "   " };

        expect(() => SaveGiveawaySchema.parse(payload)).toThrow("Prize description is required!");
    });

    it("should reject when channel_id is null", () => {
        const payload = { ...validSavePayload(), channel_id: null };

        expect(() => SaveGiveawaySchema.parse(payload)).toThrow(
            "Please select a target Discord channel for the giveaway!"
        );
    });

    it("should reject when winner_count is less than 1", () => {
        const payload = { ...validSavePayload(), winner_count: 0 };

        expect(() => SaveGiveawaySchema.parse(payload)).toThrow("Winner count must be at least 1!");
    });

    it("should tag a blank prize with code custom on path prize", () => {
        const result = SaveGiveawaySchema.safeParse({ ...validSavePayload(), prize: "   " });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues).toHaveLength(1);
            expect(result.error.issues[0].code).toBe("custom");
            expect(result.error.issues[0].message).toBe("Prize description is required!");
            expect(result.error.issues[0].path).toEqual(["prize"]);
        }
    });

    it("should tag a null channel with code custom on path channel_id", () => {
        const result = SaveGiveawaySchema.safeParse({ ...validSavePayload(), channel_id: null });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues).toHaveLength(1);
            expect(result.error.issues[0].code).toBe("custom");
            expect(result.error.issues[0].message).toBe(
                "Please select a target Discord channel for the giveaway!"
            );
            expect(result.error.issues[0].path).toEqual(["channel_id"]);
        }
    });

    it("should tag a low winner_count with code custom on path winner_count", () => {
        const result = SaveGiveawaySchema.safeParse({ ...validSavePayload(), winner_count: 0 });

        expect(result.success).toBe(false);
        if (!result.success) {
            const strict = result.error.issues.find(
                (issue) => issue.message === "Winner count must be at least 1!"
            );
            expect(strict).toMatchObject({ code: "custom", path: ["winner_count"] });
        }
    });
});

describe("giveaway message layout (format enum)", () => {
    const basePayload = {
        guild_id: "guild_123",
        host_id: "user_123",
        prize: "Nitro",
        end_time: "2026-12-31T23:59:59.000Z",
    };

    it("should accept a TEXT-format message layout with content", () => {
        const parsed = saveGiveawayInputSchema.parse({
            ...basePayload,
            message: { format: "TEXT", content: "Giveaway time!" },
        });

        expect(parsed.message.format).toBe("TEXT");
        expect(parsed.message.content).toBe("Giveaway time!");
    });

    it("should accept an EMBED-format message layout with a populated embed", () => {
        const parsed = saveGiveawayInputSchema.parse({
            ...basePayload,
            message: {
                format: "EMBED",
                embed: { title: "Nitro Giveaway", description: "Enter now!" },
            },
        });

        expect(parsed.message.format).toBe("EMBED");
    });

    it("should REJECT an unknown format value (e.g. MARKDOWN)", () => {
        expect(() =>
            saveGiveawayInputSchema.parse({
                ...basePayload,
                message: { format: "MARKDOWN", content: "bold **text**" },
            })
        ).toThrow();
    });

    it("should REJECT an unknown format on the strict save schema", () => {
        const payload = saveGiveawayInputSchema.parse({
            ...basePayload,
            channel_id: "chan_1",
        });

        expect(() =>
            SaveGiveawaySchema.parse({
                ...payload,
                message: { format: "MARKDOWN", content: "bold **text**" },
            })
        ).toThrow();
    });
});

describe("giveawaySchema (legacy slash-command rows)", () => {
    const slashRow = {
        id: 1,
        guild_id: "guild_123",
        host_id: "user_123",
        channel_id: "chan_1",
        message_id: "msg_1",
        prize: "Nitro",
        winner_count: 1,
        end_time: "2026-12-31T23:59:59.000Z",
        is_finished: false,
        // exactly what the Rust slash command used to insert (TEXT + empty content)
        message: { enabled: true, format: "TEXT", content: "", embed: {} },
    };

    it("should fall back to the default message instead of throwing", () => {
        const parsed = giveawaySchema.parse(slashRow);

        expect(parsed.message).toEqual(DEFAULT_GIVEAWAY_MESSAGE);
    });

    it("should still reject an empty TEXT message on the strict save schema", () => {
        const payload = saveGiveawayInputSchema.parse({
            guild_id: "guild_123",
            host_id: "user_123",
            channel_id: "chan_1",
            prize: "Nitro",
            end_time: "2026-12-31T23:59:59.000Z",
        });

        expect(() =>
            SaveGiveawaySchema.parse({
                ...payload,
                message: { format: "TEXT", content: "   ", embed: {} },
            })
        ).toThrow("Message content cannot be empty when format is set to TEXT!");
    });
});

describe("giveawaySchema (row shape and defaults)", () => {
    const fullRow = {
        id: 1,
        guild_id: "guild_123",
        host_id: "user_123",
        channel_id: "chan_1",
        message_id: "msg_1",
        prize: "Nitro",
        winner_count: 2,
        end_time: "2026-12-31T23:59:59.000Z",
        is_finished: false,
        message: { format: "TEXT", content: "hello", embed: {} },
    };

    it("should keep every column on a complete row", () => {
        const parsed = giveawaySchema.parse(fullRow);

        expect(parsed.id).toBe(1);
        expect(parsed.guild_id).toBe("guild_123");
        expect(parsed.host_id).toBe("user_123");
        expect(parsed.prize).toBe("Nitro");
        expect(parsed.winner_count).toBe(2);
        expect(parsed.is_finished).toBe(false);
    });

    it("should reject a row without a prize", () => {
        expect(() =>
            giveawaySchema.parse({
                id: 1,
                guild_id: "guild_123",
                host_id: "user_123",
                channel_id: "chan_1",
                prize: undefined,
                winner_count: 1,
                end_time: "2026-12-31T23:59:59.000Z",
            })
        ).toThrow();
    });

    it("should default is_finished to false", () => {
        const parsed = giveawaySchema.parse({
            id: 1,
            guild_id: "guild_123",
            host_id: "user_123",
            prize: "Nitro",
            end_time: "2026-12-31T23:59:59.000Z",
        });

        expect(parsed.is_finished).toBe(false);
    });

    it("should ship the default message enabled", () => {
        expect(DEFAULT_GIVEAWAY_MESSAGE).toMatchObject({ enabled: true });
    });

    it("should strip is_finished from save input", () => {
        const parsed = saveGiveawayInputSchema.parse({
            guild_id: "guild_123",
            host_id: "user_123",
            channel_id: "chan_1",
            prize: "Nitro",
            winner_count: 2,
            end_time: "2026-12-31T23:59:59.000Z",
            is_finished: true,
        });

        expect(parsed).not.toHaveProperty("is_finished");
    });

    it("should keep the base winner_count message without a bang", () => {
        const result = saveGiveawayInputSchema.safeParse({
            guild_id: "guild_123",
            host_id: "user_123",
            channel_id: "chan_1",
            prize: "Nitro",
            winner_count: 0,
            end_time: "2026-12-31T23:59:59.000Z",
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe("Winner count must be at least 1");
            expect(result.error.issues[0].path).toEqual(["winner_count"]);
        }
    });
});

describe("sendGiveawayInputSchema", () => {
    it("should parse a valid guildId and id", () => {
        const parsed = sendGiveawayInputSchema.parse({ guildId: "guild_123", id: "5" });

        expect(parsed.guildId).toBe("guild_123");
        expect(parsed.id).toBe(5);
    });

    it("should reject an empty guildId", () => {
        expect(() => sendGiveawayInputSchema.parse({ guildId: "", id: 5 })).toThrow(
            "Guild ID is required"
        );
    });

    it("should reject a non-positive id", () => {
        expect(() => sendGiveawayInputSchema.parse({ guildId: "guild_123", id: 0 })).toThrow(
            "Giveaway ID must be a positive integer"
        );
    });
});

describe("sendGiveawayResponseSchema", () => {
    it("should parse a backend response with message_id", () => {
        expect(sendGiveawayResponseSchema.parse({ message_id: "discord_msg_999" })).toEqual({
            message_id: "discord_msg_999",
        });
    });

    it("should reject a response without message_id", () => {
        expect(() => sendGiveawayResponseSchema.parse({})).toThrow();
    });
});
