import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    getReportConfig,
    saveReportConfig,
    getInitialReportsFromDb,
    getMoreReportsFromDb,
    deleteReportedMessageCommand,
    resolveReportStatusCommand,
    timeoutUserCommand,
    warnUserCommand,
    banUserCommand,
} from "./queries";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";
import { backendFetch } from "@/lib/backend";
import { reportConfigSchema } from "./types";

// Row mapping, SQL shape, tenant scoping and constraints live in
// queries.integration.test.ts against a real database. What stays here is the
// behaviour a real database will not produce on demand: a failing connection,
// and the backend HTTP calls.

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

vi.mock("@/lib/backend", () => ({
    backendFetch: vi.fn(),
}));

function okResponse(): Response {
    return new Response("", { status: 200 });
}

function errorResponse(body: string): Response {
    return new Response(body, { status: 500 });
}

function lastBody(): string {
    const calls = vi.mocked(backendFetch).mock.calls;
    const init = calls[0][1];
    const body = init?.body;
    return typeof body === "string" ? body : "";
}

function lastHeaders(): unknown {
    const calls = vi.mocked(backendFetch).mock.calls;
    return calls[0][1]?.headers;
}

describe("Report Query Module", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("getReportConfig", () => {
        it("should return defaults when no config is stored", async () => {
            vi.mocked(getGuildConfigField).mockResolvedValue(null);

            const result = await getReportConfig("guild_123");

            expect(getGuildConfigField).toHaveBeenCalledWith("guild_123", "report");
            expect(result.enabled).toBe(false);
        });

        it("should parse a stored config", async () => {
            vi.mocked(getGuildConfigField).mockResolvedValue({ enabled: true });

            const result = await getReportConfig("guild_123");

            expect(result.enabled).toBe(true);
        });
    });

    describe("saveReportConfig", () => {
        it("should save the config field", async () => {
            const config = reportConfigSchema.parse({
                enabled: true,
                reportingChannel: "chan_1",
            });

            await saveReportConfig("guild_123", config);

            expect(saveGuildConfigField).toHaveBeenCalledWith("guild_123", "report", config);
        });
    });

    describe("getInitialReportsFromDb", () => {
        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(getInitialReportsFromDb("guild_123")).rejects.toThrow(
                new Error("connection lost")
            );
        });
    });

    describe("getMoreReportsFromDb", () => {
        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(getMoreReportsFromDb("guild_123", 50)).rejects.toThrow(
                new Error("connection lost")
            );
        });
    });

    describe("report command helpers", () => {
        beforeEach(() => {
            vi.mocked(backendFetch).mockResolvedValue(okResponse());
        });

        it("should POST to the backend commands endpoint", async () => {
            await deleteReportedMessageCommand(1, "chan_1", "msg_1");

            expect(backendFetch).toHaveBeenCalledWith(
                "/api/commands",
                expect.objectContaining({ method: "POST" })
            );
        });

        it("should send a JSON content-type header", async () => {
            await deleteReportedMessageCommand(1, "chan_1", "msg_1");

            expect(lastHeaders()).toEqual({ "Content-Type": "application/json" });
        });

        it("should resolve true on success", async () => {
            await expect(deleteReportedMessageCommand(1, "chan_1", "msg_1")).resolves.toBe(
                true
            );
        });

        it("should include the correct payload for a delete message command", async () => {
            await deleteReportedMessageCommand(1, "chan_1", "msg_1");

            expect(JSON.parse(lastBody())).toEqual({
                action: "DELETE_MESSAGE",
                report_id: 1,
                channel_id: "chan_1",
                message_id: "msg_1",
            });
        });

        it("should include the correct payload for resolving a report", async () => {
            await resolveReportStatusCommand(2, "ACTIONED", "Mod");

            expect(JSON.parse(lastBody())).toEqual({
                action: "RESOLVE_REPORT",
                report_id: 2,
                status: "ACTIONED",
                name: "Mod",
            });
        });

        it("should include the correct payload for a timeout", async () => {
            await timeoutUserCommand(3, 60, "Mod", "Spam");

            expect(JSON.parse(lastBody())).toEqual({
                action: "TIMEOUT_USER",
                report_id: 3,
                duration_mins: 60,
                reason: "Spam",
                name: "Mod",
            });
        });

        it("should omit the reason from a timeout when not provided", async () => {
            await timeoutUserCommand(3, 60, "Mod");

            expect(lastBody()).not.toContain("reason");
        });

        it("should omit the reason from a timeout when empty", async () => {
            await timeoutUserCommand(3, 60, "Mod", "");

            expect(lastBody()).not.toContain("reason");
        });

        it("should include the correct payload for a warn", async () => {
            await warnUserCommand(4, "Mod", "Toxicity");

            expect(JSON.parse(lastBody())).toEqual({
                action: "WARN_USER",
                report_id: 4,
                reason: "Toxicity",
                name: "Mod",
            });
        });

        it("should omit the reason from a warn when not provided", async () => {
            await warnUserCommand(4, "Mod");

            expect(lastBody()).not.toContain("reason");
        });

        it("should omit the reason from a warn when empty", async () => {
            await warnUserCommand(4, "Mod", "");

            expect(lastBody()).not.toContain("reason");
        });

        it("should include the correct payload for a ban", async () => {
            await banUserCommand(5, "Mod", 1440, "Raid");

            expect(JSON.parse(lastBody())).toEqual({
                action: "BAN_USER",
                report_id: 5,
                duration_mins: 1440,
                reason: "Raid",
                name: "Mod",
            });
        });

        it("should omit the duration from a ban when not provided", async () => {
            await banUserCommand(5, "Mod", undefined, "Raid");

            expect(JSON.parse(lastBody())).toEqual({
                action: "BAN_USER",
                report_id: 5,
                reason: "Raid",
                name: "Mod",
            });
        });

        it("should omit the duration from a ban when zero", async () => {
            await banUserCommand(5, "Mod", 0, "Raid");

            expect(lastBody()).not.toContain("duration_mins");
        });

        it("should omit the reason from a ban when not provided", async () => {
            await banUserCommand(5, "Mod", 1440);

            expect(lastBody()).not.toContain("reason");
        });

        it("should omit the reason from a ban when empty", async () => {
            await banUserCommand(5, "Mod", 1440, "");

            expect(lastBody()).not.toContain("reason");
        });

        it("should throw the backend error text on failure", async () => {
            vi.mocked(backendFetch).mockResolvedValue(errorResponse("backend down"));

            await expect(deleteReportedMessageCommand(1, "chan_1", "msg_1")).rejects.toThrow(
                new Error("backend down")
            );
        });

        it("should throw a generic message when the backend error body is empty", async () => {
            vi.mocked(backendFetch).mockResolvedValue(errorResponse(""));

            await expect(banUserCommand(5, "Mod")).rejects.toThrow(
                new Error("Failed to process request with backend service.")
            );
        });
    });
});
