import { describe, it, expect } from "vitest";
import {
    moderationActionSchema,
    warnSchema,
    warnThresholdSchema,
    saveWarnThresholdItemSchema,
    saveWarnThresholdsInputSchema,
} from "./types";

describe("moderationActionSchema", () => {
    it("should accept all six actions", () => {
        expect(moderationActionSchema.safeParse("TIMEOUT").success).toBe(true);
        expect(moderationActionSchema.safeParse("KICK").success).toBe(true);
        expect(moderationActionSchema.safeParse("BAN").success).toBe(true);
        expect(moderationActionSchema.safeParse("ROLE_REMOVE").success).toBe(true);
        expect(moderationActionSchema.safeParse("ROLE_ADD").success).toBe(true);
        expect(moderationActionSchema.safeParse("ROLE_REMOVE_ALL").success).toBe(true);
    });

    it("should REJECT an unknown action", () => {
        expect(moderationActionSchema.safeParse("MUTE").success).toBe(false);
    });
});

describe("warnSchema", () => {
    it("should apply defaults and keep the date as a Date", () => {
        const parsed = warnSchema.parse({
            id: "warn_1",
            user_id: "user_1",
            guild_id: "guild_123",
            moderator_id: "user_2",
            created_at: new Date("2026-01-01T00:00:00.000Z"),
        });

        expect(parsed.reason).toBe("No reason provided.");
        expect(parsed.is_active).toBe(true);
        expect(parsed.created_at).toEqual(new Date("2026-01-01T00:00:00.000Z"));
    });

    it("should keep provided values", () => {
        const parsed = warnSchema.parse({
            id: "warn_1",
            user_id: "user_1",
            guild_id: "guild_123",
            moderator_id: "user_2",
            reason: "Spam",
            created_at: "2026-01-01T00:00:00.000Z",
            is_active: false,
        });

        expect(parsed.reason).toBe("Spam");
        expect(parsed.is_active).toBe(false);
    });

    it("should REJECT a missing user_id", () => {
        const result = warnSchema.safeParse({
            id: "warn_1",
            guild_id: "guild_123",
            moderator_id: "user_2",
            created_at: "2026-01-01T00:00:00.000Z",
        });

        expect(result.success).toBe(false);
    });
});

describe("warnThresholdSchema", () => {
    it("should apply defaults and coerce the id", () => {
        const parsed = warnThresholdSchema.parse({
            id: "3",
            guild_id: "guild_123",
            warn_count: 3,
            action_type: ["KICK"],
        });

        expect(parsed.id).toBe(3);
        expect(parsed.roles_to_add).toEqual([]);
        expect(parsed.roles_to_remove).toEqual([]);
        expect(parsed.duration).toBeNull();
    });

    it("should REJECT a warn count of zero", () => {
        const result = warnThresholdSchema.safeParse({
            id: 1,
            guild_id: "guild_123",
            warn_count: 0,
            action_type: ["KICK"],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe("Warn count must be at least 1");
        }
    });

    it("should REJECT an empty action list", () => {
        const result = warnThresholdSchema.safeParse({
            id: 1,
            guild_id: "guild_123",
            warn_count: 2,
            action_type: [],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe("At least one action is required");
        }
    });
});

describe("saveWarnThresholdItemSchema", () => {
    function validItem(): {
        warnCount: number;
        actionType: string[];
        rolesToAdd: string[];
        rolesToRemove: string[];
        duration: number | null;
    } {
        return {
            warnCount: 3,
            actionType: ["KICK"],
            rolesToAdd: [],
            rolesToRemove: [],
            duration: null,
        };
    }

    it("should accept a valid threshold item", () => {
        expect(saveWarnThresholdItemSchema.safeParse(validItem()).success).toBe(true);
    });

    it("should REJECT a zero warn count with the minimum message", () => {
        const result = saveWarnThresholdItemSchema.safeParse({
            ...validItem(),
            warnCount: 0,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe("Warn count must be at least 1");
        }
    });

    it("should REJECT an empty action list with the minimum message", () => {
        const result = saveWarnThresholdItemSchema.safeParse({
            ...validItem(),
            actionType: [],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe("At least one action is required");
        }
    });

    it("should accept more than one action", () => {
        const result = saveWarnThresholdItemSchema.safeParse({
            ...validItem(),
            actionType: ["KICK", "BAN"],
        });

        expect(result.success).toBe(true);
    });

    it("should default missing roles to empty arrays", () => {
        const parsed = saveWarnThresholdItemSchema.parse({
            warnCount: 2,
            actionType: ["KICK"],
        });

        expect(parsed.rolesToAdd).toEqual([]);
        expect(parsed.rolesToRemove).toEqual([]);
    });

    it("should REJECT a TIMEOUT without a duration", () => {
        const result = saveWarnThresholdItemSchema.safeParse({
            ...validItem(),
            actionType: ["TIMEOUT"],
            duration: null,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].code).toBe("custom");
            expect(result.error.issues[0].message).toBe(
                "Timeout duration must be at least 1 minute for warn count 3."
            );
            expect(result.error.issues.some((i) => i.path[0] === "duration")).toBe(true);
        }
    });

    it("should REJECT a TIMEOUT with a non-positive duration", () => {
        const result = saveWarnThresholdItemSchema.safeParse({
            ...validItem(),
            actionType: ["TIMEOUT"],
            duration: 0,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].code).toBe("custom");
            expect(result.error.issues[0].message).toBe(
                "Timeout duration must be at least 1 minute for warn count 3."
            );
        }
    });

    it("should accept a TIMEOUT with a positive duration", () => {
        const result = saveWarnThresholdItemSchema.safeParse({
            ...validItem(),
            actionType: ["TIMEOUT"],
            duration: 60,
        });

        expect(result.success).toBe(true);
    });

    it("should REJECT ROLE_ADD without roles to add", () => {
        const result = saveWarnThresholdItemSchema.safeParse({
            ...validItem(),
            actionType: ["ROLE_ADD"],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].code).toBe("custom");
            expect(result.error.issues[0].message).toBe(
                "Please select at least one role to add for warn count 3."
            );
            expect(result.error.issues.some((i) => i.path[0] === "rolesToAdd")).toBe(true);
        }
    });

    it("should accept ROLE_ADD with roles to add", () => {
        const result = saveWarnThresholdItemSchema.safeParse({
            ...validItem(),
            actionType: ["ROLE_ADD"],
            rolesToAdd: ["role_1"],
        });

        expect(result.success).toBe(true);
    });

    it("should REJECT ROLE_REMOVE without roles to remove", () => {
        const result = saveWarnThresholdItemSchema.safeParse({
            ...validItem(),
            actionType: ["ROLE_REMOVE"],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].code).toBe("custom");
            expect(result.error.issues[0].message).toBe(
                "Please select at least one role to remove for warn count 3."
            );
            expect(result.error.issues.some((i) => i.path[0] === "rolesToRemove")).toBe(true);
        }
    });

    it("should accept ROLE_REMOVE with roles to remove", () => {
        const result = saveWarnThresholdItemSchema.safeParse({
            ...validItem(),
            actionType: ["ROLE_REMOVE"],
            rolesToRemove: ["role_1"],
        });

        expect(result.success).toBe(true);
    });

    it("should REJECT ROLE_REMOVE with null roles to remove", () => {
        const result = saveWarnThresholdItemSchema.safeParse({
            ...validItem(),
            actionType: ["ROLE_REMOVE"],
            rolesToRemove: null,
        });

        expect(result.success).toBe(false);
    });
});

describe("saveWarnThresholdsInputSchema", () => {
    it("should accept an array of valid items", () => {
        const result = saveWarnThresholdsInputSchema.safeParse([
            { warnCount: 3, actionType: ["KICK"], duration: null },
            { warnCount: 5, actionType: ["TIMEOUT"], duration: 60 },
        ]);

        expect(result.success).toBe(true);
    });

    it("should REJECT an array with an invalid item", () => {
        const result = saveWarnThresholdsInputSchema.safeParse([
            { warnCount: 0, actionType: ["KICK"] },
        ]);

        expect(result.success).toBe(false);
    });
});
