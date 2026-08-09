import { describe, it, expect, vi, beforeEach } from "vitest";
import { getCustomCommands, saveCustomCommand, deleteCustomCommand } from "./queries";
import { db } from "@/lib/db";

vi.mock("@/lib/db", () => ({
    db: {
        query: vi.fn(),
    },
}));

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


type SaveCommandInput = Parameters<typeof saveCustomCommand>[0];

function createMockCommand(overrides: Partial<SaveCommandInput> = {}): SaveCommandInput {
    return {
        guild_id: "guild_123",
        name: "default-cmd",
        description: "I don't want head pats from SpicyWolf",
        enabled: true,
        delete_trigger: false,
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
        it("should query database and parse custom command rows", async () => {
            const mockRow = {
                id: 1,
                guild_id: "guild_123",
                name: "ping",
                description: "Pong command",
                enabled: true,
                delete_trigger: false,
                cooldown_type: "NONE",
                cooldown_seconds: 0,
                allowed_roles: [],
                ignored_roles: [],
                allowed_channels: [],
                ignored_channels: [],
                actions: [{ type: "add_role", data: { role_id: "role_1" } }],
            };

            mockQuery.mockResolvedValue({
                rows: [mockRow],
                rowCount: 1,
            });

            const result = await getCustomCommands("guild_123");

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe("ping");
            expect(db.query).toHaveBeenCalledWith(expect.any(String), ["guild_123"]);
        });

        it("should return an empty array when no rows are found", async () => {
            mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

            const result = await getCustomCommands("guild_empty");

            expect(result).toEqual([]);
        });

        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(getCustomCommands("guild_123")).rejects.toThrow("connection lost");
        });

        it("should map and coerce multiple rows correctly", async () => {
            const rows = [
                { id: 1, guild_id: "g1", name: "a", description: "", enabled: true, delete_trigger: false, cooldown_type: "NONE", cooldown_seconds: 0, allowed_roles: [], ignored_roles: [], allowed_channels: [], ignored_channels: [], actions: [] },
                { id: "2", guild_id: "g1", name: "b", description: "", enabled: false, delete_trigger: true, cooldown_type: "USER", cooldown_seconds: 5, allowed_roles: [], ignored_roles: [], allowed_channels: [], ignored_channels: [], actions: [] },
            ];
            mockQuery.mockResolvedValue({ rows, rowCount: 2 });

            const result = await getCustomCommands("g1");

            expect(result).toHaveLength(2);
            expect(result[0].id).toBe(1);
            expect(result[1].id).toBe(2);
        });
    });

    describe("saveCustomCommand", () => {
        it("should execute INSERT query for new custom commands without id", async () => {
            const newCommand = createMockCommand({
                guild_id: "guild_123",
                name: "rules",
                enabled: true,
                actions: [{ type: "add_role", data: { role_id: "role_999" } }],
            });

            const mockReturnRow = { ...newCommand, id: 42 };
            mockQuery.mockResolvedValue({
                rows: [mockReturnRow],
                rowCount: 1,
            });

            const saved = await saveCustomCommand(newCommand);

            expect(saved.id).toBe(42);
            expect(db.query).toHaveBeenCalled();

            const [, callArgs = []] = mockQuery.mock.calls[0];
            expect(callArgs).toContain(JSON.stringify(newCommand.actions));
        });

        it("should execute UPDATE query when id is present, with correct param order", async () => {
            const existingCommand = createMockCommand({
                id: 7,
                guild_id: "guild_123",
                name: "updated-cmd",
                description: "desc",
                enabled: true,
                delete_trigger: true,
                cooldown_type: "SERVER",
                cooldown_seconds: 30,
                allowed_roles: ["role_a"],
                ignored_roles: ["role_b"],
                allowed_channels: ["chan_a"],
                ignored_channels: ["chan_b"],
                actions: [{ type: "add_role", data: { role_id: "role_999" } }],
            });

            mockQuery.mockResolvedValue({
                rows: [existingCommand],
                rowCount: 1,
            });

            await saveCustomCommand(existingCommand);

            const [queryStr, params = []] = mockQuery.mock.calls[0];
            expect(queryStr).toContain("UPDATE custom_commands");
            expect(queryStr).not.toContain("INSERT INTO");

            expect(params[params.length - 2]).toBe(7);
            expect(params[params.length - 1]).toBe("guild_123");
            expect(params[0]).toBe("updated-cmd");
        });

        it("should pass empty string to SQL parameters when description is empty", async () => {
            const newCommand = createMockCommand({
                guild_id: "guild_123",
                name: "no-desc",
                description: "",
                enabled: true,
                actions: [{ type: "add_role", data: { role_id: "role_1" } }],
            });
            mockQuery.mockResolvedValue({
                rows: [{ ...newCommand, id: 99 }],
                rowCount: 1,
            });

            await saveCustomCommand(newCommand);

            const [, params = []] = mockQuery.mock.calls[0];
            expect(params).toContain("");
        });

        it("should propagate a database error", async () => {
            const newCommand = createMockCommand({
                guild_id: "guild_123",
                name: "will-fail",
                enabled: true,
                actions: [{ type: "add_role", data: { role_id: "role_1" } }],
            });
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(saveCustomCommand(newCommand)).rejects.toThrow("connection lost");
        });
    });

    describe("deleteCustomCommand", () => {
        it("should delete command using both id AND guildId for multi-tenant safety", async () => {
            mockQuery.mockResolvedValue({
                rowCount: 1,
            });

            const result = await deleteCustomCommand(42, "guild_123");

            expect(result).toBe(true);
            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining("WHERE id = $1 AND guild_id = $2"),
                [42, "guild_123"]
            );
        });

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
});