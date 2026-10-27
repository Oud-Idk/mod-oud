import { describe, it, expect, vi, beforeEach } from "vitest";
import { getCustomCommands, saveCustomCommand, deleteCustomCommand, getCustomPrefix, saveCustomPrefix } from "./queries";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";

// Row mapping, SQL shape, tenant scoping and constraints live in
// queries.integration.test.ts against a real database. What stays here is the
// behaviour a real database will not produce on demand: a failing connection
// and a null rowCount.

const mockQuery = vi.hoisted(() =>
    vi.fn<(sql: string, params?: unknown[]) => Promise<{
        rows?: unknown[];
        rowCount?: number | null;
    }>>()
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


type SaveCommandInput = Parameters<typeof saveCustomCommand>[1];

function createMockCommand(overrides: Partial<SaveCommandInput> = {}): SaveCommandInput {
    return {
        guild_id: "guild_123",
        name: "default-cmd",
        description: "I wish SpicyWolf will die tomorrow",
        enabled: true,
        delete_trigger: false,
        trigger_anywhere: false,
        cooldown_type: "NONE",
        cooldown_seconds: 0,
        allowed_roles: [],
        ignored_roles: [],
        allowed_channels: [],
        ignored_channels: [],
        actions: [],
        ...overrides,
    };
}

describe("Custom Commands Query Module", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("getCustomCommands", () => {
        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(getCustomCommands("guild_123")).rejects.toThrow("connection lost");
        });
    });

    describe("saveCustomCommand", () => {
        it("should propagate a database error", async () => {
            const newCommand = createMockCommand({
                guild_id: "guild_123",
                name: "will-fail",
                enabled: true,
                actions: [{ type: "add_role", data: { role_id: "role_1" } }],
            });
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(saveCustomCommand("guild_123", newCommand)).rejects.toThrow("connection lost");
        });
    });

    describe("deleteCustomCommand", () => {
        it("should return false when no row matches id + guildId", async () => {
            mockQuery.mockResolvedValue({ rowCount: 0 });

            const result = await deleteCustomCommand(999, "guild_123");

            expect(result).toBe(false);
        });

        it("should return false when rowCount is null", async () => {
            mockQuery.mockResolvedValue({ rowCount: null });

            const result = await deleteCustomCommand(1, "guild_123");

            expect(result).toBe(false);
        });
    });

    describe("getCustomPrefix", () => {
        it("should return default prefix when DB returns null", async () => {
            vi.mocked(getGuildConfigField).mockResolvedValue(null);

            const result = await getCustomPrefix("guild_123");

            expect(getGuildConfigField).toHaveBeenCalledWith("guild_123", "custom_commands");
            expect(result.prefix).toBe("!");
        });

        it("should return saved prefix", async () => {
            vi.mocked(getGuildConfigField).mockResolvedValue({ prefix: "?" });

            const result = await getCustomPrefix("guild_123");

            expect(result.prefix).toBe("?");
        });
    });

    describe("saveCustomPrefix", () => {
        it("should save via guild config field", async () => {
            vi.mocked(saveGuildConfigField).mockResolvedValue(undefined);

            await saveCustomPrefix("guild_123", { prefix: "?" });

            expect(saveGuildConfigField).toHaveBeenCalledWith("guild_123", "custom_commands", { prefix: "?" });
        });
    });
});