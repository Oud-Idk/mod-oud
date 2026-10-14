import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    getMessageFilteringConfig,
    saveMessageFilteringConfig,
    getBadWordRulesets,
    saveBadWordRuleset,
    deleteBadWordRuleset,
} from "./queries";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";
import {
    MessageFilteringConfig,
    saveBadWordRulesetInputSchema,
    type SaveableBadWordRuleset,
} from "@/features/message-filtering/types";

const mockQuery = vi.hoisted(() =>
    vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows?: unknown[]; rowCount?: number | null }>>()
);

const mockRedisDel = vi.hoisted(() => vi.fn());
const mockRedisPublish = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
    db: {
        query: mockQuery,
    },
}));

vi.mock("@/lib/redis", () => ({
    default: {
        del: mockRedisDel,
        publish: mockRedisPublish,
    },
}));

vi.mock("@/features/_shared/guild", () => ({
    getGuildConfigField: vi.fn(),
    saveGuildConfigField: vi.fn(),
}));

// Row mapping, SQL shape, tenant scoping, upsert conflict targets and cache
// keys live in queries.integration.test.ts against a real database. What
// stays here is the behaviour a real database will not produce on demand: a
// failing connection and a failing Redis.

describe("Message Filtering Query Module", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => {return});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("getMessageFilteringConfig", () => {
        it("should return default config when DB returns null", async () => {
            vi.mocked(getGuildConfigField).mockResolvedValue(null);

            const result = await getMessageFilteringConfig("guild_123");

            expect(getGuildConfigField).toHaveBeenCalledWith("guild_123", "message_filtering");
            expect(result.badWords.enabled).toBe(false);
            expect(result.antiSpam.messagesPerWindow).toBe(8);
        });

        it("should merge partial saved DB config with Zod defaults", async () => {
            vi.mocked(getGuildConfigField).mockResolvedValue({
                excessiveCaps: { enabled: true, threshold: 0.9 },
            });

            const result = await getMessageFilteringConfig("guild_123");

            expect(result.excessiveCaps.enabled).toBe(true);
            expect(result.excessiveCaps.threshold).toBe(0.9);
            expect(result.excessiveCaps.minLength).toBe(10);
        });

        it("should propagate a database error from getGuildConfigField", async () => {
            vi.mocked(getGuildConfigField).mockRejectedValue(new Error("connection lost"));

            await expect(getMessageFilteringConfig("guild_123")).rejects.toThrow("connection lost");
        });
    });

    describe("saveMessageFilteringConfig", () => {
        it("should save the config under the message_filtering key", async () => {
            const config: MessageFilteringConfig = {
                badWords: { enabled: false, action: [], timeoutDurationSeconds: null, scope: { mode: "EXEMPT", roles: [], channels: [] }, patterns: [] },
                serverInvites: { enabled: false, action: [], timeoutDurationSeconds: null, scope: { mode: "EXEMPT", roles: [], channels: [] } },
                externalLinks: { enabled: false, action: [], timeoutDurationSeconds: null, scope: { mode: "EXEMPT", roles: [], channels: [] }, blockOnlyMalicious: true, mode: "ALLOWLIST", allowedDomains: [], blockedDomains: [] },
                excessiveCaps: { enabled: false, action: [], timeoutDurationSeconds: null, scope: { mode: "EXEMPT", roles: [], channels: [] }, threshold: 0.7, minLength: 10 },
                excessiveEmojis: { enabled: false, action: [], timeoutDurationSeconds: null, scope: { mode: "EXEMPT", roles: [], channels: [] }, maxEmojis: 10 },
                excessiveSpoilers: { enabled: false, action: [], timeoutDurationSeconds: null, scope: { mode: "EXEMPT", roles: [], channels: [] }, threshold: 0.5 },
                excessiveMentions: { enabled: false, action: [], timeoutDurationSeconds: null, scope: { mode: "EXEMPT", roles: [], channels: [] }, maxMentions: 5 },
                zalgo: { enabled: false, action: [], timeoutDurationSeconds: null, scope: { mode: "EXEMPT", roles: [], channels: [] } },
                antiSpam: { enabled: false, action: [], timeoutDurationSeconds: null, scope: { mode: "EXEMPT", roles: [], channels: [] }, messagesPerWindow: 8, windowSeconds: 5 },
                crossChannelSpam: { enabled: false, action: [], timeoutDurationSeconds: null, scope: { mode: "EXEMPT", roles: [], channels: [] }, minChannels: 3, windowSeconds: 600, similarityThreshold: 0.85, minLength: 15, priorCopies: { mode: "KEEP" } },
                offensiveMessages: { enabled: false, action: [], timeoutDurationSeconds: null, scope: { mode: "EXEMPT", roles: [], channels: [] }, flagThreshold: "MODERATE" },
                cryptoAddress: { enabled: false, action: [], timeoutDurationSeconds: null, scope: { mode: "EXEMPT", roles: [], channels: [] } },
                globalSettings: { mode: "EXEMPT", roles: [], channels: [] },
            };

            await saveMessageFilteringConfig("guild_123", config);

            expect(saveGuildConfigField).toHaveBeenCalledWith("guild_123", "message_filtering", config);
        });

        it("should propagate a database error from saveGuildConfigField", async () => {
            vi.mocked(saveGuildConfigField).mockRejectedValue(new Error("connection lost"));

            await expect(
                saveMessageFilteringConfig("guild_123", messageFilteringConfigFixture())
            ).rejects.toThrow("connection lost");
        });
    });

    describe("getBadWordRulesets", () => {
        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(getBadWordRulesets("guild_123")).rejects.toThrow("connection lost");
        });
    });

    describe("saveBadWordRuleset", () => {
        function validRuleset(overrides: Record<string, unknown> = {}): SaveableBadWordRuleset {
            return saveBadWordRulesetInputSchema.parse({ name: "No swears", ...overrides });
        }

        it("should still save when Redis invalidation throws", async () => {
            mockQuery.mockResolvedValue({ rows: [rulesetRowFixture()] });
            mockRedisDel.mockRejectedValue(new Error("redis down"));

            const saved = await saveBadWordRuleset("guild_123", validRuleset());

            expect(saved.name).toBe("No swears");
        });

        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(saveBadWordRuleset("guild_123", validRuleset())).rejects.toThrow(
                "connection lost"
            );
        });
    });

    describe("deleteBadWordRuleset", () => {
        it("should still delete when Redis invalidation throws", async () => {
            mockQuery.mockResolvedValue({ rowCount: 1 });
            mockRedisDel.mockRejectedValue(new Error("redis down"));

            await expect(deleteBadWordRuleset("guild_123", "uuid_1")).resolves.toBeUndefined();
        });

        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(deleteBadWordRuleset("guild_123", "uuid_1")).rejects.toThrow(
                "connection lost"
            );
        });
    });
});

function messageFilteringConfigFixture(): MessageFilteringConfig {
    return {
        badWords: { enabled: false, action: [], timeoutDurationSeconds: null, scope: { mode: "EXEMPT", roles: [], channels: [] }, patterns: [] },
        serverInvites: { enabled: false, action: [], timeoutDurationSeconds: null, scope: { mode: "EXEMPT", roles: [], channels: [] } },
        externalLinks: { enabled: false, action: [], timeoutDurationSeconds: null, scope: { mode: "EXEMPT", roles: [], channels: [] }, blockOnlyMalicious: true, mode: "ALLOWLIST", allowedDomains: [], blockedDomains: [] },
        excessiveCaps: { enabled: false, action: [], timeoutDurationSeconds: null, scope: { mode: "EXEMPT", roles: [], channels: [] }, threshold: 0.7, minLength: 10 },
        excessiveEmojis: { enabled: false, action: [], timeoutDurationSeconds: null, scope: { mode: "EXEMPT", roles: [], channels: [] }, maxEmojis: 10 },
        excessiveSpoilers: { enabled: false, action: [], timeoutDurationSeconds: null, scope: { mode: "EXEMPT", roles: [], channels: [] }, threshold: 0.5 },
        excessiveMentions: { enabled: false, action: [], timeoutDurationSeconds: null, scope: { mode: "EXEMPT", roles: [], channels: [] }, maxMentions: 5 },
        zalgo: { enabled: false, action: [], timeoutDurationSeconds: null, scope: { mode: "EXEMPT", roles: [], channels: [] } },
        antiSpam: { enabled: false, action: [], timeoutDurationSeconds: null, scope: { mode: "EXEMPT", roles: [], channels: [] }, messagesPerWindow: 8, windowSeconds: 5 },
        crossChannelSpam: { enabled: false, action: [], timeoutDurationSeconds: null, scope: { mode: "EXEMPT", roles: [], channels: [] }, minChannels: 3, windowSeconds: 600, similarityThreshold: 0.85, minLength: 15, priorCopies: { mode: "KEEP" } },
        offensiveMessages: { enabled: false, action: [], timeoutDurationSeconds: null, scope: { mode: "EXEMPT", roles: [], channels: [] }, flagThreshold: "MODERATE" },
        cryptoAddress: { enabled: false, action: [], timeoutDurationSeconds: null, scope: { mode: "EXEMPT", roles: [], channels: [] } },
        globalSettings: { mode: "EXEMPT", roles: [], channels: [] },
    };
}

function rulesetRowFixture(): {
    id: string;
    guildId: string;
    name: string;
    enabled: boolean;
    patterns: never[];
    actions: never[];
    timeoutDurationSeconds: null;
    scope: { mode: "EXEMPT"; roles: never[]; channels: never[] };
    createdAt: Date;
    updatedAt: Date;
} {
    return {
        id: "uuid_1",
        guildId: "guild_123",
        name: "No swears",
        enabled: true,
        patterns: [],
        actions: [],
        timeoutDurationSeconds: null,
        scope: { mode: "EXEMPT", roles: [], channels: [] },
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    };
}
