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

describe("Message Filtering Query Module", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => {});
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
        it("should query the database and parse rows", async () => {
            mockQuery.mockResolvedValue({
                rows: [
                    {
                        id: "uuid_1",
                        guildId: "guild_123",
                        name: "No swears",
                        enabled: true,
                        patterns: [],
                        actions: [],
                        timeoutDurationSeconds: null,
                        scope: { mode: "EXEMPT", roles: [], channels: [] },
                        createdAt: "2026-01-01T00:00:00.000Z",
                        updatedAt: "2026-01-01T00:00:00.000Z",
                    },
                ],
            });

            const result = await getBadWordRulesets("guild_123");

            expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("FROM bad_word_rulesets"), ["guild_123"]);
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe("No swears");
        });

        it("should return an empty array when no rows exist", async () => {
            mockQuery.mockResolvedValue({ rows: [] });

            const result = await getBadWordRulesets("guild_123");

            expect(result).toEqual([]);
        });

        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(getBadWordRulesets("guild_123")).rejects.toThrow("connection lost");
        });
    });

    describe("saveBadWordRuleset", () => {
        function validRuleset(overrides: Record<string, unknown> = {}): SaveableBadWordRuleset {
            return saveBadWordRulesetInputSchema.parse({ name: "No swears", ...overrides });
        }

        it("should INSERT a new ruleset and invalidate the cache", async () => {
            mockQuery.mockResolvedValue({
                rows: [rulesetRowFixture()],
            });

            const saved = await saveBadWordRuleset("guild_123", validRuleset());

            const [queryStr, params = []] = mockQuery.mock.calls[0];
            expect(queryStr).toContain("INSERT INTO bad_word_rulesets");
            expect(queryStr).toContain("ON CONFLICT (id)");
            expect(params[1]).toBe("guild_123");
            expect(params[2]).toBe("No swears");
            expect(mockRedisDel).toHaveBeenCalledWith("config:guild:guild_123:bad_words");
            expect(mockRedisPublish).toHaveBeenCalledWith("config_updates", "invalidate:guild_123");
            expect(saved.name).toBe("No swears");
        });

        it("should stringify the JSON array params", async () => {
            mockQuery.mockResolvedValue({
                rows: [rulesetRowFixture()],
            });

            await saveBadWordRuleset(
                "guild_123",
                validRuleset({
                    patterns: [{ value: "darn", strategy: "EXACT" }],
                    actions: ["WARN"],
                })
            );

            const [, params = []] = mockQuery.mock.calls[0];
            expect(JSON.parse(String(params[4]))).toEqual([{ value: "darn", strategy: "EXACT" }]);
            expect(JSON.parse(String(params[5]))).toEqual(["WARN"]);
        });

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
        it("should delete by id and guildId and invalidate the caches", async () => {
            mockQuery.mockResolvedValue({ rowCount: 1 });

            await deleteBadWordRuleset("guild_123", "uuid_1");

            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining("WHERE id = $1"),
                expect.arrayContaining(["uuid_1", "guild_123"])
            );
            expect(mockRedisDel).toHaveBeenCalledWith("config:guild:guild_123:bad_words");
            expect(mockRedisDel).toHaveBeenCalledWith("config:guild:guild_123");
            expect(mockRedisPublish).toHaveBeenCalledWith(
                "config_updates",
                "invalidate:guild_123:bad_words"
            );
        });

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
    createdAt: string;
    updatedAt: string;
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
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
    };
}
