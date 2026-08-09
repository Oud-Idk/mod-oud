import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getInviteTrackerConfig, saveInviteTrackerConfig, getInviteLeaderboard } from "./queries";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";
import { InviteTrackerConfig } from "./types";

const mockQuery = vi.hoisted(() =>
    vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows?: unknown[] }>>()
);

vi.mock("@/lib/db", () => ({
    db: {
        query: mockQuery,
    },
}));

vi.mock("@/features/_shared/guild", () => ({
    getGuildConfigField: vi.fn(),
    saveGuildConfigField: vi.fn(),
}));

describe("Invite Tracker Query Module", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    function configFixture(overrides: Partial<InviteTrackerConfig> = {}): InviteTrackerConfig {
        return { enabled: false, ...overrides };
    }

    describe("getInviteTrackerConfig", () => {
        it("should return default config when DB returns null", async () => {
            vi.mocked(getGuildConfigField).mockResolvedValue(null);

            const result = await getInviteTrackerConfig("guild_123");

            expect(getGuildConfigField).toHaveBeenCalledWith("guild_123", "invite_tracker");
            expect(result.enabled).toBe(false);
        });

        it("should parse a saved enabled config", async () => {
            vi.mocked(getGuildConfigField).mockResolvedValue({ enabled: true });

            const result = await getInviteTrackerConfig("guild_123");

            expect(result.enabled).toBe(true);
        });

        it("should reject a non-boolean stored value", async () => {
            vi.mocked(getGuildConfigField).mockResolvedValue({ enabled: "yes" });

            await expect(getInviteTrackerConfig("guild_123")).rejects.toThrow();
        });

        it("should propagate a database error from getGuildConfigField", async () => {
            vi.mocked(getGuildConfigField).mockRejectedValue(new Error("connection lost"));

            await expect(getInviteTrackerConfig("guild_123")).rejects.toThrow("connection lost");
        });
    });

    describe("saveInviteTrackerConfig", () => {
        it("should save the config under the invite_tracker key", async () => {
            const config = configFixture({ enabled: true });

            await saveInviteTrackerConfig("guild_123", config);

            expect(saveGuildConfigField).toHaveBeenCalledWith("guild_123", "invite_tracker", config);
        });

        it("should propagate a database error from saveGuildConfigField", async () => {
            vi.mocked(saveGuildConfigField).mockRejectedValue(new Error("connection lost"));

            await expect(saveInviteTrackerConfig("guild_123", configFixture())).rejects.toThrow(
                "connection lost"
            );
        });
    });

    describe("getInviteLeaderboard", () => {
        it("should query the database and parse the returned rows", async () => {
            mockQuery.mockResolvedValue({
                rows: [
                    { inviterId: "user_1", count: 10 },
                    { inviterId: "user_2", count: 3 },
                ],
            });

            const result = await getInviteLeaderboard("guild_123");

            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining("FROM inviter_counts"),
                ["guild_123", 15, 0]
            );
            expect(result).toEqual([
                { inviterId: "user_1", count: 10 },
                { inviterId: "user_2", count: 3 },
            ]);
        });

        it("should pass the limit and offset to the query", async () => {
            mockQuery.mockResolvedValue({ rows: [] });

            await getInviteLeaderboard("guild_123", 5, 20);

            expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ["guild_123", 5, 20]);
        });

        it("should return an empty array and log when the DB query throws", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            const result = await getInviteLeaderboard("guild_123");

            expect(result).toEqual([]);
        });

        it("should return an empty array when the rows fail schema validation", async () => {
            mockQuery.mockResolvedValue({
                rows: [{ inviterId: "user_1", count: -5 }],
            });

            const result = await getInviteLeaderboard("guild_123");

            expect(result).toEqual([]);
        });

        it("should return an empty array for invalid input parameters", async () => {
            const result = await getInviteLeaderboard("", 5, 0);

            expect(result).toEqual([]);
            expect(mockQuery).not.toHaveBeenCalled();
        });
    });
});
