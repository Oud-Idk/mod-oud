import { describe, it, expect, vi, beforeEach } from "vitest";
import { getMusicStatsSummary, getTopListeners, getTopTracks } from "./queries";

// Column names, the interval cast and the aggregate expressions are covered by
// queries.integration.test.ts against a real database. What stays here is the
// behaviour a real database will not produce on demand: the argument guards that
// reject before touching the connection, error propagation, and a malformed row.

const mockQuery = vi.hoisted(() =>
    vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows?: unknown[]; rowCount?: number }>>()
);

vi.mock("@/lib/db", () => ({
    db: { query: mockQuery },
}));

const GUILD_ID = "123456789012345678";

interface DbCall {
    sql: string;
    params: unknown[] | undefined;
}

function lastCall(): DbCall {
    const call = mockQuery.mock.calls.at(-1);
    if (call === undefined) throw new Error("db.query was never called");
    return { sql: call[0], params: call[1] };
}

describe("music-stats query module", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    describe("argument guards", () => {
        it("should reject an empty guildId before querying the summary", async () => {
            await expect(getMusicStatsSummary("")).rejects.toThrow();

            expect(mockQuery).not.toHaveBeenCalled();
        });

        it("should reject an empty guildId before querying the top tracks", async () => {
            await expect(getTopTracks("")).rejects.toThrow();

            expect(mockQuery).not.toHaveBeenCalled();
        });

        it("should reject an empty guildId before querying the top listeners", async () => {
            await expect(getTopListeners("")).rejects.toThrow();

            expect(mockQuery).not.toHaveBeenCalled();
        });

        it("should reject a limit of zero or negative", async () => {
            await expect(getTopTracks(GUILD_ID, 0)).rejects.toThrow();
            await expect(getTopListeners(GUILD_ID, -1)).rejects.toThrow();

            expect(mockQuery).not.toHaveBeenCalled();
        });

        it("should reject a limit above 100", async () => {
            await expect(getTopTracks(GUILD_ID, 101)).rejects.toThrow();
            await expect(getTopListeners(GUILD_ID, 101)).rejects.toThrow();

            expect(mockQuery).not.toHaveBeenCalled();
        });

        it("should reject a fractional limit", async () => {
            await expect(getTopTracks(GUILD_ID, 1.5)).rejects.toThrow();
            await expect(getTopListeners(GUILD_ID, 1.5)).rejects.toThrow();

            expect(mockQuery).not.toHaveBeenCalled();
        });

        it("should accept the limit boundaries of 1 and 100", async () => {
            mockQuery.mockResolvedValue({ rows: [] });

            await expect(getTopTracks(GUILD_ID, 1)).resolves.toEqual([]);
            await expect(getTopListeners(GUILD_ID, 100)).resolves.toEqual([]);

            expect(mockQuery).toHaveBeenCalledTimes(2);
        });

        it("should default the limit to 20", async () => {
            mockQuery.mockResolvedValue({ rows: [] });

            await getTopTracks(GUILD_ID);

            expect(lastCall().params?.at(-1)).toBe(20);
        });
    });

    describe("query construction", () => {
        it("should pass the 30 day lookback as the second summary parameter", async () => {
            mockQuery.mockResolvedValue({
                rows: [{ totalPlays: 0, totalListenedMs: 0, uniqueTracks: 0, uniqueListeners: 0 }],
            });

            await getMusicStatsSummary(GUILD_ID);

            const { params } = lastCall();
            expect(params?.[0]).toBe(GUILD_ID);
            expect(params?.[1]).toBe("30 days");
        });

        it("should pass guild, lookback and limit as separate parameters for the top lists", async () => {
            mockQuery.mockResolvedValue({ rows: [] });

            await getTopTracks(GUILD_ID, 5);

            const { params } = lastCall();
            expect(params).toEqual([GUILD_ID, "30 days", 5]);
        });
    });

    describe("row parsing", () => {
        it("should reject a summary row that does not match the schema", async () => {
            mockQuery.mockResolvedValue({
                rows: [{ totalPlays: "lots", totalListenedMs: 0, uniqueTracks: 0, uniqueListeners: 0 }],
            });

            await expect(getMusicStatsSummary(GUILD_ID)).rejects.toThrow();
        });

        it("should reject a summary when the query returns no rows", async () => {
            // A COUNT(*) aggregate always yields one row, so an empty result means
            // the query did not run as written. Parsing undefined must not throw a
            // TypeError that hides that.
            mockQuery.mockResolvedValue({ rows: [] });

            await expect(getMusicStatsSummary(GUILD_ID)).rejects.toThrow();
        });

        it("should reject a track row whose trackUrl is undefined rather than null", async () => {
            mockQuery.mockResolvedValue({
                rows: [{ title: "T", artist: "A", plays: 1, totalListenedMs: 0 }],
            });

            await expect(getTopTracks(GUILD_ID)).rejects.toThrow();
        });

        it("should reject a listener row with a non-string userId", async () => {
            mockQuery.mockResolvedValue({
                rows: [{ userId: 5, username: "spicy", plays: 1, totalListenedMs: 0 }],
            });

            await expect(getTopListeners(GUILD_ID)).rejects.toThrow();
        });

        it("should accept an empty result set for both top lists", async () => {
            mockQuery.mockResolvedValue({ rows: [] });

            expect(await getTopTracks(GUILD_ID)).toEqual([]);
            expect(await getTopListeners(GUILD_ID)).toEqual([]);
        });
    });

    describe("error propagation", () => {
        it("should propagate a database error from the summary query", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(getMusicStatsSummary(GUILD_ID)).rejects.toThrow("connection lost");
        });

        it("should propagate a database error from the top tracks query", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(getTopTracks(GUILD_ID)).rejects.toThrow("connection lost");
        });

        it("should propagate a database error from the top listeners query", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(getTopListeners(GUILD_ID)).rejects.toThrow("connection lost");
        });
    });
});