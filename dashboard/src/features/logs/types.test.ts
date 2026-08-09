import { describe, it, expect } from "vitest";
import {
    automodLogSchema,
    joinLeaveLogSchema,
    moderationLogSchema,
    getLogsInputSchema,
    joinLeaveActionSchema,
} from "./types";

describe("automodLogSchema", () => {
    it("should parse a full automod log row and coerce the id", () => {
        const result = automodLogSchema.safeParse({
            id: "42",
            guild_id: "guild_123",
            user_id: "user_1",
            channel_id: "chan_1",
            message_id: "msg_1",
            rule_type: "BAD_WORD",
            trigger_content: "spam",
            original_content: "spam spam",
            actions_taken: ["DELETE"],
            created_at: "2026-01-01T00:00:00.000Z",
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.id).toBe("42");
            expect(result.data.actions_taken).toEqual(["DELETE"]);
        }
    });

    it("should apply defaults for nullish columns", () => {
        const parsed = automodLogSchema.parse({
            id: "1",
            guild_id: "guild_123",
            user_id: "user_1",
            rule_type: "LINK",
            created_at: "2026-01-01T00:00:00.000Z",
        });

        expect(parsed.channel_id).toBeNull();
        expect(parsed.message_id).toBeNull();
        expect(parsed.trigger_content).toBeNull();
        expect(parsed.original_content).toBeNull();
        expect(parsed.actions_taken).toEqual([]);
    });

    it("should REJECT a row missing the rule_type", () => {
        const result = automodLogSchema.safeParse({
            id: "1",
            guild_id: "guild_123",
            user_id: "user_1",
            created_at: "2026-01-01T00:00:00.000Z",
        });

        expect(result.success).toBe(false);
    });
});

describe("joinLeaveLogSchema", () => {
    it("should parse a JOIN log row", () => {
        const result = joinLeaveLogSchema.safeParse({
            id: "7",
            user_id: "user_1",
            guild_id: "guild_123",
            action: "JOIN",
            created_at: "2026-01-01T00:00:00.000Z",
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.action).toBe("JOIN");
        }
    });

    it("should REJECT an unknown action", () => {
        const result = joinLeaveLogSchema.safeParse({
            id: "7",
            user_id: "user_1",
            guild_id: "guild_123",
            action: "KICK",
            created_at: "2026-01-01T00:00:00.000Z",
        });

        expect(result.success).toBe(false);
    });
});

describe("moderationLogSchema", () => {
    it("should parse a full moderation log row", () => {
        const result = moderationLogSchema.safeParse({
            case_id: "99",
            guild_id: "guild_123",
            target_id: "user_2",
            moderator_id: "user_1",
            action_type: "BAN",
            reason: "Spam",
            duration: null,
            created_at: "2026-01-01T00:00:00.000Z",
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.case_id).toBe("99");
            expect(result.data.reason).toBe("Spam");
        }
    });

    it("should apply defaults for nullish columns", () => {
        const parsed = moderationLogSchema.parse({
            case_id: "1",
            guild_id: "guild_123",
            moderator_id: "user_1",
            action_type: "WARN",
            created_at: "2026-01-01T00:00:00.000Z",
        });

        expect(parsed.target_id).toBeNull();
        expect(parsed.reason).toBeNull();
        expect(parsed.duration).toBeNull();
    });
});

describe("joinLeaveActionSchema", () => {
    it("should accept JOIN and LEAVE", () => {
        expect(joinLeaveActionSchema.safeParse("JOIN").success).toBe(true);
        expect(joinLeaveActionSchema.safeParse("LEAVE").success).toBe(true);
    });

    it("should REJECT anything else", () => {
        expect(joinLeaveActionSchema.safeParse("MUTE").success).toBe(false);
    });
});

describe("getLogsInputSchema", () => {
    it("should apply default limit", () => {
        const parsed = getLogsInputSchema.parse({ guildId: "guild_123" });

        expect(parsed.guildId).toBe("guild_123");
        expect(parsed.limit).toBe(20);
        expect(parsed.cursorCreatedAt).toBeNull();
        expect(parsed.cursorId).toBeNull();
    });

    it("should accept an explicit limit and cursors", () => {
        const parsed = getLogsInputSchema.parse({
            guildId: "guild_123",
            limit: 5,
            cursorCreatedAt: "2026-01-01T00:00:00.000Z",
            cursorId: "99",
        });

        expect(parsed.limit).toBe(5);
        expect(parsed.cursorCreatedAt).toBe("2026-01-01T00:00:00.000Z");
        expect(parsed.cursorId).toBe("99");
    });

    it("should REJECT an empty guildId", () => {
        expect(getLogsInputSchema.safeParse({ guildId: "" }).success).toBe(false);
    });

    it("should REJECT a non-positive limit", () => {
        expect(getLogsInputSchema.safeParse({ guildId: "g", limit: 0 }).success).toBe(false);
    });
});
