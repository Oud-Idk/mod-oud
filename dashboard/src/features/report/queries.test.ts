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
import { reportConfigSchema } from "./types";

interface MockResponse {
    ok: boolean;
    text(): Promise<string>;
}

const mockQuery = vi.hoisted(() =>
    vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows?: unknown[] }>>()
);

const mockFetch = vi.hoisted(() =>
    vi.fn<(url: string, init?: RequestInit) => Promise<MockResponse>>()
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

vi.stubGlobal("fetch", mockFetch);

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
        it("should parse the returned rows", async () => {
            mockQuery.mockResolvedValue({
                rows: [
                    {
                        id: "1",
                        guild_id: "guild_123",
                        channel_id: "chan_1",
                        message_id: "msg_1",
                        author_id: "user_1",
                        reporter_id: "user_2",
                        created_at: "2026-01-01T00:00:00.000Z",
                    },
                ],
            });

            const result = await getInitialReportsFromDb("guild_123");

            expect(result[0].id).toBe(1);
            expect(result[0].status).toBe("UNDER_REVIEW");
            const params = mockQuery.mock.calls[0][1];
            expect(params).toEqual(["guild_123"]);
        });
    });

    describe("getMoreReportsFromDb", () => {
        it("should pass the beforeId cursor", async () => {
            mockQuery.mockResolvedValue({ rows: [] });

            await getMoreReportsFromDb("guild_123", 50);

            const params = mockQuery.mock.calls[0][1];
            expect(params).toEqual(["guild_123", 50]);
        });
    });

    describe("report command helpers", () => {
        beforeEach(() => {
            mockFetch.mockResolvedValue({
                ok: true,
                text: () => Promise.resolve(""),
            });
        });

        it("should POST to the backend commands endpoint", async () => {
            await deleteReportedMessageCommand(1, "chan_1", "msg_1");

            const url = mockFetch.mock.calls[0][0];
            expect(url).toContain("/api/commands");
            const init = mockFetch.mock.calls[0][1];
            expect(init?.method).toBe("POST");
        });

        it("should include the correct payload for a delete message command", async () => {
            await deleteReportedMessageCommand(1, "chan_1", "msg_1");

            const init = mockFetch.mock.calls[0][1];
            const bodyText = typeof init?.body === "string" ? init.body : "";
            expect(JSON.parse(bodyText)).toEqual({
                action: "DELETE_MESSAGE",
                report_id: 1,
                channel_id: "chan_1",
                message_id: "msg_1",
            });
        });

        it("should include the correct payload for resolving a report", async () => {
            await resolveReportStatusCommand(2, "ACTIONED", "Mod");

            const init = mockFetch.mock.calls[0][1];
            const bodyText = typeof init?.body === "string" ? init.body : "";
            expect(JSON.parse(bodyText)).toEqual({
                action: "RESOLVE_REPORT",
                report_id: 2,
                status: "ACTIONED",
                name: "Mod",
            });
        });

        it("should include the correct payload for a timeout", async () => {
            await timeoutUserCommand(3, 60, "Mod", "Spam");

            const init = mockFetch.mock.calls[0][1];
            const bodyText = typeof init?.body === "string" ? init.body : "";
            expect(JSON.parse(bodyText)).toEqual({
                action: "TIMEOUT_USER",
                report_id: 3,
                duration_mins: 60,
                reason: "Spam",
                name: "Mod",
            });
        });

        it("should omit the reason from a timeout when not provided", async () => {
            await timeoutUserCommand(3, 60, "Mod");

            const init = mockFetch.mock.calls[0][1];
            const bodyText = typeof init?.body === "string" ? init.body : "";
            expect(bodyText).not.toContain("reason");
        });

        it("should include the correct payload for a warn", async () => {
            await warnUserCommand(4, "Mod", "Toxicity");

            const init = mockFetch.mock.calls[0][1];
            const bodyText = typeof init?.body === "string" ? init.body : "";
            expect(JSON.parse(bodyText)).toEqual({
                action: "WARN_USER",
                report_id: 4,
                reason: "Toxicity",
                name: "Mod",
            });
        });

        it("should include the correct payload for a ban", async () => {
            await banUserCommand(5, "Mod", 1440, "Raid");

            const init = mockFetch.mock.calls[0][1];
            const bodyText = typeof init?.body === "string" ? init.body : "";
            expect(JSON.parse(bodyText)).toEqual({
                action: "BAN_USER",
                report_id: 5,
                duration_mins: 1440,
                reason: "Raid",
                name: "Mod",
            });
        });

        it("should throw the backend error text on failure", async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                text: () => Promise.resolve("backend down"),
            });

            await expect(deleteReportedMessageCommand(1, "chan_1", "msg_1")).rejects.toThrow(
                "backend down"
            );
        });

        it("should throw a generic message when the backend error body is empty", async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                text: () => Promise.resolve(""),
            });

            await expect(banUserCommand(5, "Mod")).rejects.toThrow(
                "Failed to process request with backend service."
            );
        });
    });
});
