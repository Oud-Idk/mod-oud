import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import {
    deleteEconomyItem,
    deleteEconomyWorkMessage,
    fetchMoreEconomyLeaderboard,
    getEconomyLeaderboard,
    saveEconomyWorkMessage,
    syncEconomyWorkMessages,
} from "./queries";
import { getEconomyConfig, saveEconomyConfig } from "./queries";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";
import { type EconomyConfig } from "./types";

// Row mapping, SQL shape, tenant scoping and constraints live in
// queries.integration.test.ts against a real database. What stays here is the
// behaviour a real database will not produce on demand: a failing connection, a
// null rowCount, a schema rejection on a row the database would not have
// returned anyway.

const mockQuery = vi.hoisted(() =>
    vi.fn<(sql: string, params?: unknown[]) => Promise<{
        rows?: unknown[];
        rowCount?: number | null;
    }>>()
);

const mockConnect = vi.hoisted(() =>
    vi.fn<() => Promise<{
        query: (sql: string, params?: unknown[]) => Promise<{ rows?: unknown[] }>;
        release: () => void;
    }>>()
);

vi.mock("@/lib/db", () => ({
    db: {
        query: mockQuery,
        connect: mockConnect,
    },
}));

vi.mock("@/features/_shared/guild", () => ({
    getGuildConfigField: vi.fn(),
    saveGuildConfigField: vi.fn(),
}));

const GUILD_ID = "guild_123";
const ITEM_UUID = "11111111-1111-4111-8111-111111111111";
const MESSAGE_UUID = "33333333-3333-4333-8333-333333333333";

interface StubClient {
    query: Mock<(sql: string, params?: unknown[]) => Promise<{ rows?: unknown[] }>>;
    release: Mock<() => void>;
}

function stubClient(rows: unknown[] = []): StubClient {
    const query = vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows?: unknown[] }>>(
        () => Promise.resolve({ rows })
    );
    const release = vi.fn<() => void>();
    mockConnect.mockResolvedValue({ query, release });
    return { query, release };
}

function statementsOf(query: Mock<(sql: string, params?: unknown[]) => Promise<unknown>>): string[] {
    return query.mock.calls.map((call) => call[0]);
}

describe("Economy Query Module", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("getEconomyConfig", () => {
        it("should return default config when DB returns null", async () => {
            vi.mocked(getGuildConfigField).mockResolvedValue(null);

            const result = await getEconomyConfig(GUILD_ID);

            expect(getGuildConfigField).toHaveBeenCalledWith(GUILD_ID, "economy");
            expect(result.enabled).toBe(false);
            expect(result.currencyName).toBe("coins");
            expect(result.workCooldownSecs).toBe(3600);
            expect(result.workMinReward).toBe(1000);
            expect(result.workMaxReward).toBe(5000);
        });

        it("should merge partial saved DB config with Zod defaults", async () => {
            vi.mocked(getGuildConfigField).mockResolvedValue({
                enabled: true,
                currencyName: "rubies",
            });

            const result = await getEconomyConfig(GUILD_ID);

            expect(result.enabled).toBe(true);
            expect(result.currencyName).toBe("rubies");
            expect(result.workCooldownSecs).toBe(3600);
            expect(result.workMinReward).toBe(1000);
            expect(result.workMaxReward).toBe(5000);
        });

        it("should keep every field of a fully populated config", async () => {
            const stored: EconomyConfig = {
                enabled: true,
                currencyName: "diamonds",
                workCooldownSecs: 900,
                workMinReward: 10,
                workMaxReward: 20,
                workMessage: "Nice work",
                startingBalance: 250,
                giftingEnabled: false,
            };
            vi.mocked(getGuildConfigField).mockResolvedValue(stored);

            expect(await getEconomyConfig(GUILD_ID)).toEqual(stored);
        });

        it("should propagate a database error from getGuildConfigField", async () => {
            vi.mocked(getGuildConfigField).mockRejectedValue(
                new Error("Database connection lost in the coin vault")
            );

            await expect(getEconomyConfig(GUILD_ID)).rejects.toThrow(
                "Database connection lost in the coin vault"
            );
        });
    });

    describe("saveEconomyConfig", () => {
        it("should save the config under the economy key", async () => {
            const config = economyConfigFixture();

            await saveEconomyConfig(GUILD_ID, config);

            expect(saveGuildConfigField).toHaveBeenCalledWith(GUILD_ID, "economy", config);
        });

        it("should propagate a database error from saveGuildConfigField", async () => {
            vi.mocked(saveGuildConfigField).mockRejectedValue(
                new Error("Failed to write to economy ledger")
            );

            await expect(saveEconomyConfig(GUILD_ID, economyConfigFixture())).rejects.toThrow(
                "Failed to write to economy ledger"
            );
        });
    });

    describe("deleteEconomyItem", () => {
        it("should return false when rowCount is null", async () => {
            mockQuery.mockResolvedValue({ rows: [], rowCount: null });

            expect(await deleteEconomyItem(GUILD_ID, ITEM_UUID)).toBe(false);
        });

        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(deleteEconomyItem(GUILD_ID, ITEM_UUID)).rejects.toThrow("connection lost");
        });
    });

    describe("deleteEconomyWorkMessage", () => {
        it("should return false when rowCount is null", async () => {
            mockQuery.mockResolvedValue({ rows: [], rowCount: null });

            expect(await deleteEconomyWorkMessage(GUILD_ID, MESSAGE_UUID)).toBe(false);
        });

        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(deleteEconomyWorkMessage(GUILD_ID, MESSAGE_UUID)).rejects.toThrow(
                "connection lost"
            );
        });
    });

    describe("saveEconomyWorkMessage", () => {
        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(saveEconomyWorkMessage(GUILD_ID, { content: "Work!" })).rejects.toThrow(
                "connection lost"
            );
        });
    });

    describe("syncEconomyWorkMessages", () => {
        it("should release the client when BEGIN itself fails", async () => {
            const client = stubClient([]);
            client.query.mockImplementation((sql: string) =>
                sql === "BEGIN"
                    ? Promise.reject(new Error("connection lost"))
                    : Promise.resolve({ rows: [] })
            );

            await expect(syncEconomyWorkMessages(GUILD_ID, [])).rejects.toThrow("connection lost");

            expect(statementsOf(client.query)).not.toContain("COMMIT");
            expect(client.release).toHaveBeenCalledTimes(1);
        });

        it("should release the client when the commit itself fails", async () => {
            const client = stubClient([]);
            client.query.mockImplementation((sql: string) =>
                sql === "COMMIT"
                    ? Promise.reject(new Error("connection lost during commit"))
                    : Promise.resolve({ rows: [] })
            );

            await expect(syncEconomyWorkMessages(GUILD_ID, [])).rejects.toThrow(
                "connection lost during commit"
            );

            expect(statementsOf(client.query)).toContain("ROLLBACK");
            expect(client.release).toHaveBeenCalledTimes(1);
        });
    });

    describe("getEconomyLeaderboard", () => {
        it("should reject a row that does not match the entry schema", async () => {
            mockQuery.mockResolvedValue({
                rows: [{ userId: "user_1", cash: "lots", bank: 0, total: 0 }],
                rowCount: 1,
            });

            await expect(getEconomyLeaderboard(GUILD_ID)).rejects.toThrow();
        });

        it("should reject an empty guildId before querying", async () => {
            await expect(getEconomyLeaderboard("")).rejects.toThrow();

            expect(mockQuery).not.toHaveBeenCalled();
        });

        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(getEconomyLeaderboard(GUILD_ID)).rejects.toThrow("connection lost");
        });
    });

    describe("fetchMoreEconomyLeaderboard", () => {
        it("should reject a row that does not match the entry schema", async () => {
            mockQuery.mockResolvedValue({
                rows: [{ userId: "user_3", cash: "lots", bank: 0, total: 0 }],
                rowCount: 1,
            });

            await expect(fetchMoreEconomyLeaderboard(GUILD_ID, 300)).rejects.toThrow();
        });

        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(fetchMoreEconomyLeaderboard(GUILD_ID, 300)).rejects.toThrow("connection lost");
        });
    });
});

function economyConfigFixture(): EconomyConfig {
    return {
        enabled: true,
        currencyName: "diamonds",
        workCooldownSecs: 1800,
        workMinReward: 500,
        workMaxReward: 2500,
        workMessage: "Work message",
        startingBalance: 0,
        giftingEnabled: true,
    };
}