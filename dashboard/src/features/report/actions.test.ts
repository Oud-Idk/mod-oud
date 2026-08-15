import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { z } from "zod";
import {
    fetchInitialReportsAction,
    fetchMoreReportsAction,
    deleteReportedMessageAction,
    resolveReportStatusAction,
    timeoutUserAction,
    warnUserAction,
    banUserAction,
    saveReportConfigAction,
} from "./actions";
import {
    banUserCommand,
    deleteReportedMessageCommand,
    getInitialReportsFromDb,
    getMoreReportsFromDb,
    resolveReportStatusCommand,
    saveReportConfig,
    timeoutUserCommand,
    warnUserCommand,
} from "./queries";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { revalidatePath } from "next/cache";
import type { ReportedMessage } from "./types";

interface MockSession {
    user?: { name?: string | null };
    expires: string;
}

const mockAuth = vi.hoisted(() => vi.fn<() => Promise<MockSession | null>>());

vi.mock("@/features/_shared/guild", () => ({
    verifyGuildAccess: vi.fn(),
}));

vi.mock("./queries", () => ({
    banUserCommand: vi.fn(),
    deleteReportedMessageCommand: vi.fn(),
    getInitialReportsFromDb: vi.fn(),
    getMoreReportsFromDb: vi.fn(),
    resolveReportStatusCommand: vi.fn(),
    saveReportConfig: vi.fn(),
    timeoutUserCommand: vi.fn(),
    warnUserCommand: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
    auth: mockAuth,
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

function reportedMessageFixture(): ReportedMessage {
    return {
        id: 1,
        guild_id: "guild_123",
        channel_id: "chan_1",
        message_id: "msg_1",
        author_id: "user_1",
        reporter_id: "user_2",
        content: "spam",
        attachment_url: null,
        reason: "Spam",
        status: "UNDER_REVIEW",
        moderator_id: null,
        moderator_notes: null,
        created_at: "2026-01-01T00:00:00.000Z",
        resolved_at: null,
        message_deleted: false,
        user_warned: false,
        user_timed_out: false,
        user_banned: false,
    };
}

describe("Report Action Module", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        mockAuth.mockResolvedValue({
            user: { name: "Mod" },
            expires: "2026-01-01",
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("fetchInitialReportsAction", () => {
        it("should verify access and return the reports", async () => {
            const rows = [reportedMessageFixture()];
            vi.mocked(getInitialReportsFromDb).mockResolvedValue(rows);

            const result = await fetchInitialReportsAction("guild_123");

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(result).toEqual(rows);
        });

        it("should return an empty array on error", async () => {
            vi.mocked(getInitialReportsFromDb).mockRejectedValue(new Error("db down"));

            const result = await fetchInitialReportsAction("guild_123");

            expect(result).toEqual([]);
        });
    });

    describe("fetchMoreReportsAction", () => {
        it("should pass the beforeId cursor", async () => {
            vi.mocked(getMoreReportsFromDb).mockResolvedValue([]);

            await fetchMoreReportsAction("guild_123", 50);

            expect(getMoreReportsFromDb).toHaveBeenCalledWith("guild_123", 50);
        });

        it("should return an empty array on error", async () => {
            vi.mocked(getMoreReportsFromDb).mockRejectedValue(new Error("db down"));

            const result = await fetchMoreReportsAction("guild_123", 50);

            expect(result).toEqual([]);
        });
    });

    describe("deleteReportedMessageAction", () => {
        it("should verify access, send the command, and revalidate", async () => {
            await deleteReportedMessageAction("guild_123", 1, "chan_1", "msg_1");

            expect(deleteReportedMessageCommand).toHaveBeenCalledWith(1, "chan_1", "msg_1");
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/report");
        });

        it("should throw the underlying error message", async () => {
            vi.mocked(deleteReportedMessageCommand).mockRejectedValue(new Error("backend down"));

            await expect(
                deleteReportedMessageAction("guild_123", 1, "chan_1", "msg_1")
            ).rejects.toThrow("backend down");
        });

        it("should throw fallback error message when thrown value is not an Error instance", async () => {
            vi.mocked(deleteReportedMessageCommand).mockRejectedValue("string error");

            await expect(
                deleteReportedMessageAction("guild_123", 1, "chan_1", "msg_1")
            ).rejects.toThrow("Failed to delete message.");
        });
    });

    describe("resolveReportStatusAction", () => {
        it("should resolve with the moderator's name and revalidate", async () => {
            await resolveReportStatusAction("guild_123", 1, "ACTIONED");

            expect(resolveReportStatusCommand).toHaveBeenCalledWith(1, "ACTIONED", "Mod");
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/report");
        });

        // Kills Moderator name fallback mutant (?? "Moderator")
        it("should fall back to 'Moderator' if session user name is missing", async () => {
            mockAuth.mockResolvedValue({ user: { name: null }, expires: "2026-01-01" });

            await resolveReportStatusAction("guild_123", 1, "ACTIONED");

            expect(resolveReportStatusCommand).toHaveBeenCalledWith(1, "ACTIONED", "Moderator");
        });

        it("should throw Unauthorized when there is no session user", async () => {
            mockAuth.mockResolvedValue({ user: undefined, expires: "2026-01-01" });

            await expect(resolveReportStatusAction("guild_123", 1, "ACTIONED")).rejects.toThrow(
                "Unauthorized."
            );
        });

        // Kills session?.user OptionalChaining mutant
        it("should throw Unauthorized when session is null", async () => {
            mockAuth.mockResolvedValue(null);

            await expect(resolveReportStatusAction("guild_123", 1, "ACTIONED")).rejects.toThrow(
                "Unauthorized."
            );
        });

        it("should throw fallback error message on non-Error failure", async () => {
            vi.mocked(resolveReportStatusCommand).mockRejectedValue("string error");

            await expect(resolveReportStatusAction("guild_123", 1, "ACTIONED")).rejects.toThrow(
                "Failed to resolve report."
            );
        });
    });

    describe("timeoutUserAction", () => {
        it("should send the timeout command with the moderator's name and reason", async () => {
            await timeoutUserAction("guild_123", 1, 60, "Spam");

            expect(timeoutUserCommand).toHaveBeenCalledWith(1, 60, "Mod", "Spam");
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/report");
        });

        it("should fall back to 'Moderator' if session user name is missing", async () => {
            mockAuth.mockResolvedValue({ user: { name: null }, expires: "2026-01-01" });

            await timeoutUserAction("guild_123", 1, 60, "Spam");

            expect(timeoutUserCommand).toHaveBeenCalledWith(1, 60, "Moderator", "Spam");
        });

        it("should throw Unauthorized when there is no session user", async () => {
            mockAuth.mockResolvedValue({ user: undefined, expires: "2026-01-01" });

            await expect(timeoutUserAction("guild_123", 1, 60)).rejects.toThrow("Unauthorized.");
        });

        it("should throw fallback error message on non-Error failure", async () => {
            vi.mocked(timeoutUserCommand).mockRejectedValue("string error");

            await expect(timeoutUserAction("guild_123", 1, 60)).rejects.toThrow(
                "Failed to timeout user."
            );
        });
    });

    describe("warnUserAction", () => {
        it("should send the warn command with the moderator's name and revalidate", async () => {
            await warnUserAction("guild_123", 1, "Toxicity");

            expect(warnUserCommand).toHaveBeenCalledWith(1, "Mod", "Toxicity");
            // Kills revalidatePath mutant
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/report");
        });

        it("should fall back to 'Moderator' if session user name is missing", async () => {
            mockAuth.mockResolvedValue({ user: { name: null }, expires: "2026-01-01" });

            await warnUserAction("guild_123", 1, "Toxicity");

            expect(warnUserCommand).toHaveBeenCalledWith(1, "Moderator", "Toxicity");
        });

        // Kills Unauthorized block/string mutants
        it("should throw Unauthorized when there is no session user", async () => {
            mockAuth.mockResolvedValue({ user: undefined, expires: "2026-01-01" });

            await expect(warnUserAction("guild_123", 1)).rejects.toThrow("Unauthorized.");
        });

        it("should throw underlying error on command failure", async () => {
            vi.mocked(warnUserCommand).mockRejectedValue(new Error("Warn error"));

            await expect(warnUserAction("guild_123", 1)).rejects.toThrow("Warn error");
        });

        it("should throw fallback error message on non-Error failure", async () => {
            vi.mocked(warnUserCommand).mockRejectedValue("string error");

            await expect(warnUserAction("guild_123", 1)).rejects.toThrow("Failed to warn user.");
        });
    });

    describe("banUserAction", () => {
        it("should send the ban command with the moderator's name and revalidate", async () => {
            await banUserAction("guild_123", 1, 1440, "Raid");

            expect(banUserCommand).toHaveBeenCalledWith(1, "Mod", 1440, "Raid");
            // Kills revalidatePath mutant
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/report");
        });

        it("should fall back to 'Moderator' if session user name is missing", async () => {
            mockAuth.mockResolvedValue({ user: { name: null }, expires: "2026-01-01" });

            await banUserAction("guild_123", 1, 1440, "Raid");

            expect(banUserCommand).toHaveBeenCalledWith(1, "Moderator", 1440, "Raid");
        });

        // Kills Unauthorized block/string mutants
        it("should throw Unauthorized when there is no session user", async () => {
            mockAuth.mockResolvedValue({ user: undefined, expires: "2026-01-01" });

            await expect(banUserAction("guild_123", 1)).rejects.toThrow("Unauthorized.");
        });

        it("should throw underlying error on command failure", async () => {
            vi.mocked(banUserCommand).mockRejectedValue(new Error("Ban error"));

            await expect(banUserAction("guild_123", 1)).rejects.toThrow("Ban error");
        });

        it("should throw fallback error message on non-Error failure", async () => {
            vi.mocked(banUserCommand).mockRejectedValue("string error");

            await expect(banUserAction("guild_123", 1)).rejects.toThrow("Failed to ban user.");
        });
    });

    describe("saveReportConfigAction", () => {
        it("should validate, save, and revalidate", async () => {
            await saveReportConfigAction("guild_123", { enabled: true });

            expect(saveReportConfig).toHaveBeenCalled();
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/report");
        });

        it("should throw the first zod issue message for invalid data", async () => {
            await expect(saveReportConfigAction("guild_123", { enabled: "yes" })).rejects.toThrow();
            expect(saveReportConfig).not.toHaveBeenCalled();
        });

        it("should rethrow the first zod issue message when the query rejects with a ZodError", async () => {
            vi.mocked(saveReportConfig).mockRejectedValue(
                new z.ZodError([{ code: "custom", message: "Report config validation failure", path: [] }])
            );

            await expect(saveReportConfigAction("guild_123", { enabled: true })).rejects.toThrow(
                "Report config validation failure"
            );
        });


        it("should throw underlying error message on non-ZodError failure", async () => {
            vi.mocked(saveReportConfig).mockRejectedValue(new Error("Database write failure"));

            await expect(saveReportConfigAction("guild_123", { enabled: true })).rejects.toThrow(
                "Database write failure"
            );
        });

        it("should throw fallback error message on non-Error failure", async () => {
            vi.mocked(saveReportConfig).mockRejectedValue("string error");

            await expect(saveReportConfigAction("guild_123", { enabled: true })).rejects.toThrow(
                "Could not save configuration."
            );
        });
    });
});