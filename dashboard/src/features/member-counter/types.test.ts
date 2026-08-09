import { describe, it, expect } from "vitest";
import {
    memberCounterConfigSchema,
    saveMemberCounterConfigSchema,
    counterChannelSchema,
    defaultMemberCounterConfig,
} from "./types";

describe("memberCounterConfigSchema", () => {
    it("should apply defaults when an empty object is parsed", () => {
        const parsed = memberCounterConfigSchema.parse({});

        expect(parsed.enabled).toBe(false);
        expect(parsed.updateIntervalMinutes).toBe(15);
        expect(parsed.counters).toEqual([]);
        expect(defaultMemberCounterConfig).toEqual(parsed);
    });

    it("should PASS a fully configured config", () => {
        const result = memberCounterConfigSchema.safeParse({
            enabled: true,
            updateIntervalMinutes: 5,
            counters: [
                {
                    id: "c1",
                    channelId: "voice_1",
                    counterType: "TOTAL_MEMBERS",
                    nameTemplate: "👥 {count}",
                },
                {
                    id: "c2",
                    channelId: "voice_2",
                    counterType: "ROLE_COUNT",
                    roleId: "role_1",
                },
            ],
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.counters).toHaveLength(2);
            expect(result.data.counters[1].roleId).toBe("role_1");
        }
    });

    it("should REJECT an unknown counter type", () => {
        const result = memberCounterConfigSchema.safeParse({
            counters: [{ id: "c1", channelId: "voice_1", counterType: "SOMETHING" }],
        });

        expect(result.success).toBe(false);
    });

    it("should accept any numeric update interval (no min bound)", () => {
        expect(memberCounterConfigSchema.safeParse({ updateIntervalMinutes: 0 }).success).toBe(true);
        expect(memberCounterConfigSchema.safeParse({ updateIntervalMinutes: 60 }).success).toBe(true);
    });
});

describe("counterChannelSchema", () => {
    it("should apply defaults for a minimal counter", () => {
        const parsed = counterChannelSchema.parse({
            id: "c1",
            channelId: "voice_1",
            counterType: "HUMANS_ONLY",
        });

        expect(parsed.roleId).toBeNull();
        expect(parsed.nameTemplate).toBe("👥 Members: {count}");
    });

    it("should accept all counter types", () => {
        for (const counterType of [
            "TOTAL_MEMBERS",
            "HUMANS_ONLY",
            "BOTS_ONLY",
            "ONLINE_MEMBERS",
            "ROLE_COUNT",
        ]) {
            expect(
                counterChannelSchema.safeParse({ id: "c1", counterType }).success
            ).toBe(true);
        }
    });
});

describe("saveMemberCounterConfigSchema", () => {
    it("should REJECT when enabled with a counter missing a channel", () => {
        const result = saveMemberCounterConfigSchema.safeParse({
            enabled: true,
            counters: [{ id: "c1", channelId: null, counterType: "TOTAL_MEMBERS" }],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe(
                "Counter #1 requires a target voice channel!"
            );
        }
    });

    it("should REJECT a ROLE_COUNT counter without a role", () => {
        const result = saveMemberCounterConfigSchema.safeParse({
            enabled: true,
            counters: [
                { id: "c1", channelId: "voice_1", counterType: "ROLE_COUNT", roleId: null },
            ],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some((i) => i.message.includes("requires a specific role"))).toBe(
                true
            );
        }
    });

    it("should PASS when disabled even with incomplete counters", () => {
        const result = saveMemberCounterConfigSchema.safeParse({
            enabled: false,
            counters: [{ id: "c1", channelId: null, counterType: "ROLE_COUNT", roleId: null }],
        });

        expect(result.success).toBe(true);
    });

    it("should PASS when enabled with valid counters", () => {
        const result = saveMemberCounterConfigSchema.safeParse({
            enabled: true,
            counters: [
                { id: "c1", channelId: "voice_1", counterType: "ROLE_COUNT", roleId: "role_1" },
            ],
        });

        expect(result.success).toBe(true);
    });
});
