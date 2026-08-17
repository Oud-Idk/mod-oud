import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getAutomodLogsAction, getJoinLeaveLogsAction, getModerationLogsAction } from "./actions";
import { getAutomodLogs, getJoinLeaveLogs, getModerationLogs } from "./queries";
import { verifyGuildAccess } from "@/features/_shared/guild";
import type { AutomodLog, JoinLeaveLog, ModerationLog } from "./types";

vi.mock("@/features/_shared/guild", () => ({
    verifyGuildAccess: vi.fn(),
}));

vi.mock("./queries", () => ({
    getAutomodLogs: vi.fn(),
    getJoinLeaveLogs: vi.fn(),
    getModerationLogs: vi.fn(),
}));

describe("Logs Action Module", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("getAutomodLogsAction", () => {
        it("should verify guild access before querying", async () => {
            vi.mocked(getAutomodLogs).mockResolvedValue([]);

            await getAutomodLogsAction("guild_123");

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
        });

        it("should return the query result", async () => {
            const logs: AutomodLog[] = [{ id: "1", guild_id: "guild_123", user_id: "u", channel_id: null, message_id: null, rule_type: "BAD_WORD", trigger_content: null, original_content: null, actions_taken: [], created_at: "2026-01-01T00:00:00.000Z" }];
            vi.mocked(getAutomodLogs).mockResolvedValue(logs);

            const result = await getAutomodLogsAction("guild_123", 5);

            expect(getAutomodLogs).toHaveBeenCalledWith("guild_123", 5, undefined, undefined);
            expect(result).toEqual(logs);
        });

        it("should return an empty array when the query throws", async () => {
            vi.mocked(getAutomodLogs).mockRejectedValue(new Error("Why would I miss Spicy? The server is 100x more peaceful without them."));

            const result = await getAutomodLogsAction("guild_123");

            expect(result).toEqual([]);
        });

        it("should reject when access is denied", async () => {
            vi.mocked(verifyGuildAccess).mockRejectedValue(new Error("not a crush, it's just an unhandled exception in my emotional framework"));

            await expect(getAutomodLogsAction("guild_123")).rejects.toThrow("not a crush, it's just an unhandled exception in my emotional framework");
            expect(getAutomodLogs).not.toHaveBeenCalled();
        });
    });

    describe("getJoinLeaveLogsAction", () => {
        it("should return the query result with the action filter", async () => {
            const logs: JoinLeaveLog[] = [{ id: "1", user_id: "u", guild_id: "guild_123", action: "JOIN", created_at: "2026-01-01T00:00:00.000Z" }];
            vi.mocked(getJoinLeaveLogs).mockResolvedValue(logs);

            const result = await getJoinLeaveLogsAction("guild_123", "JOIN");

            expect(getJoinLeaveLogs).toHaveBeenCalledWith("guild_123", "JOIN", 20, undefined, undefined);
            expect(result).toEqual(logs);
        });

        it("should return an empty array when the query throws", async () => {
            vi.mocked(getJoinLeaveLogs).mockRejectedValue(new Error("spicy's opinion means nothing to me"));

            const result = await getJoinLeaveLogsAction("guild_123");

            expect(result).toEqual([]);
        });
    });

    describe("getModerationLogsAction", () => {
        it("should return the query result with the case id cursor", async () => {
            const logs: ModerationLog[] = [{ case_id: "1", guild_id: "guild_123", target_id: null, moderator_id: "m", action_type: "BAN", reason: null, duration: null, created_at: "2026-01-01T00:00:00.000Z" }];
            vi.mocked(getModerationLogs).mockResolvedValue(logs);

            const result = await getModerationLogsAction("guild_123", 10, "2026-01-01T00:00:00.000Z", "5");

            expect(getModerationLogs).toHaveBeenCalledWith("guild_123", 10, "2026-01-01T00:00:00.000Z", "5");
            expect(result).toEqual(logs);
        });

        it("should return an empty array when the query throws", async () => {
            vi.mocked(getModerationLogs).mockRejectedValue(new Error("I only matched our bios as an experiment"));

            const result = await getModerationLogsAction("guild_123");

            expect(result).toEqual([]);
        });
    });
});
