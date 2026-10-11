import { describe, it, expect } from "vitest";
import {
    listenerStatSchema,
    musicStatsSummarySchema,
    trackStatSchema,
} from "./types";

describe("trackStatSchema", () => {
    it("should parse a fully populated track stat", () => {
        const stat = {
            title: "Bohemian Rhapsody",
            artist: "Queen",
            trackUrl: "https://example.com/track/1",
            plays: 12,
            totalListenedMs: 600_000,
        };

        expect(trackStatSchema.parse(stat)).toEqual(stat);
    });

    it("should accept a null trackUrl", () => {
        const parsed = trackStatSchema.parse({
            title: "Unknown",
            artist: "Unknown",
            trackUrl: null,
            plays: 1,
            totalListenedMs: 0,
        });

        expect(parsed.trackUrl).toBeNull();
    });

    // pg hands back a BIGINT column as a string, so the counters arrive coerced.
    it("should coerce bigint strings for plays and totalListenedMs", () => {
        const parsed = trackStatSchema.parse({
            title: "Bohemian Rhapsody",
            artist: "Queen",
            trackUrl: null,
            plays: "12",
            totalListenedMs: "600000",
        });

        expect(parsed.plays).toBe(12);
        expect(parsed.totalListenedMs).toBe(600_000);
    });

    it("should reject a missing trackUrl, since the column is nullable but not optional", () => {
        const result = trackStatSchema.safeParse({
            title: "Unknown",
            artist: "Unknown",
            plays: 1,
            totalListenedMs: 0,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].path).toEqual(["trackUrl"]);
            expect(result.error.issues[0].message).toBe(
                "Invalid input: expected string, received undefined"
            );
        }
    });

    it("should reject a non-string trackUrl", () => {
        const result = trackStatSchema.safeParse({
            title: "Unknown",
            artist: "Unknown",
            trackUrl: 123,
            plays: 1,
            totalListenedMs: 0,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe(
                "Invalid input: expected string, received number"
            );
        }
    });

    it("should reject a fractional play count", () => {
        const result = trackStatSchema.safeParse({
            title: "Unknown",
            artist: "Unknown",
            trackUrl: null,
            plays: 1.5,
            totalListenedMs: 0,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe(
                "Invalid input: expected int, received number"
            );
        }
    });

    it("should reject a negative play count or listened total", () => {
        expect(
            trackStatSchema.safeParse({
                title: "Unknown",
                artist: "Unknown",
                trackUrl: null,
                plays: -1,
                totalListenedMs: 0,
            }).success
        ).toBe(false);
        expect(
            trackStatSchema.safeParse({
                title: "Unknown",
                artist: "Unknown",
                trackUrl: null,
                plays: 0,
                totalListenedMs: -1,
            }).success
        ).toBe(false);
    });

    it("should accept zero for both counters", () => {
        const parsed = trackStatSchema.parse({
            title: "Unknown",
            artist: "Unknown",
            trackUrl: null,
            plays: 0,
            totalListenedMs: 0,
        });

        expect(parsed.plays).toBe(0);
        expect(parsed.totalListenedMs).toBe(0);
    });

    // z.coerce.number() runs Number() first, so a null column becomes 0 rather
    // than failing. A row whose counter silently arrives as null therefore reads
    // as zero plays instead of surfacing as a schema error.
    it("should coerce a null counter to zero rather than rejecting it", () => {
        const parsed = trackStatSchema.parse({
            title: "Unknown",
            artist: "Unknown",
            trackUrl: null,
            plays: null,
            totalListenedMs: null,
        });

        expect(parsed.plays).toBe(0);
        expect(parsed.totalListenedMs).toBe(0);
    });

    it("should reject an unparseable counter string", () => {
        const result = trackStatSchema.safeParse({
            title: "Unknown",
            artist: "Unknown",
            trackUrl: null,
            plays: "lots",
            totalListenedMs: 0,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe(
                "Invalid input: expected number, received NaN"
            );
        }
    });

    it("should strip unknown keys", () => {
        const parsed = trackStatSchema.parse({
            title: "Unknown",
            artist: "Unknown",
            trackUrl: null,
            plays: 1,
            totalListenedMs: 0,
            legacy_column: "nope",
        });

        expect(parsed).not.toHaveProperty("legacy_column");
    });
});

describe("listenerStatSchema", () => {
    it("should parse a fully populated listener stat", () => {
        const stat = {
            userId: "123456789012345678",
            username: "spicy",
            plays: 4,
            totalListenedMs: 900_000,
        };

        expect(listenerStatSchema.parse(stat)).toEqual(stat);
    });

    it("should default a missing username to an empty string", () => {
        // The query COALESCEs an unmatched LEFT JOIN to '', so the default is a
        // second line of defence for a row that arrives without one.
        const parsed = listenerStatSchema.parse({
            userId: "123456789012345678",
            plays: 1,
            totalListenedMs: 0,
        });

        expect(parsed.username).toBe("");
    });

    // A Discord snowflake is well past Number.MAX_SAFE_INTEGER, so the column
    // must stay a string end to end.
    it("should keep a snowflake userId as an exact string", () => {
        const parsed = listenerStatSchema.parse({
            userId: "1234567890123456789",
            username: "spicy",
            plays: 1,
            totalListenedMs: 0,
        });

        expect(parsed.userId).toBe("1234567890123456789");
        expect(parsed.userId).not.toBe(String(Number("1234567890123456789")));
    });

    it("should reject a numeric userId", () => {
        const result = listenerStatSchema.safeParse({
            userId: 123456789012345678,
            username: "spicy",
            plays: 1,
            totalListenedMs: 0,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].path).toEqual(["userId"]);
        }
    });

    it("should reject a missing userId", () => {
        const result = listenerStatSchema.safeParse({ username: "spicy", plays: 1, totalListenedMs: 0 });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].path).toEqual(["userId"]);
        }
    });

    it("should coerce bigint strings for the counters", () => {
        const parsed = listenerStatSchema.parse({
            userId: "123456789012345678",
            username: "spicy",
            plays: "4",
            totalListenedMs: "900000",
        });

        expect(parsed.plays).toBe(4);
        expect(parsed.totalListenedMs).toBe(900_000);
    });

    it("should reject negative counters", () => {
        expect(
            listenerStatSchema.safeParse({
                userId: "123456789012345678",
                username: "spicy",
                plays: -1,
                totalListenedMs: 0,
            }).success
        ).toBe(false);
    });
});

describe("musicStatsSummarySchema", () => {
    it("should parse a fully populated summary", () => {
        const summary = {
            totalPlays: 42,
            totalListenedMs: 3_600_000,
            uniqueTracks: 7,
            uniqueListeners: 3,
        };

        expect(musicStatsSummarySchema.parse(summary)).toEqual(summary);
    });

    // The aggregate casts totalListenedMs to BIGINT, which pg returns as a string.
    it("should coerce the bigint totalListenedMs to a number", () => {
        const parsed = musicStatsSummarySchema.parse({
            totalPlays: 42,
            totalListenedMs: "3600000",
            uniqueTracks: 7,
            uniqueListeners: 3,
        });

        expect(parsed.totalListenedMs).toBe(3_600_000);
        expect(typeof parsed.totalListenedMs).toBe("number");
    });

    it("should parse the all-zero summary an empty table produces", () => {
        const parsed = musicStatsSummarySchema.parse({
            totalPlays: 0,
            totalListenedMs: 0,
            uniqueTracks: 0,
            uniqueListeners: 0,
        });

        expect(parsed).toEqual({
            totalPlays: 0,
            totalListenedMs: 0,
            uniqueTracks: 0,
            uniqueListeners: 0,
        });
    });

    it("should reject a summary missing every counter", () => {
        const result = musicStatsSummarySchema.safeParse({});

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.map((issue) => issue.path)).toEqual([
                ["totalPlays"],
                ["totalListenedMs"],
                ["uniqueTracks"],
                ["uniqueListeners"],
            ]);
        }
    });

    it("should reject a negative or fractional counter", () => {
        expect(
            musicStatsSummarySchema.safeParse({
                totalPlays: -1,
                totalListenedMs: 0,
                uniqueTracks: 0,
                uniqueListeners: 0,
            }).success
        ).toBe(false);
        expect(
            musicStatsSummarySchema.safeParse({
                totalPlays: 1.5,
                totalListenedMs: 0,
                uniqueTracks: 0,
                uniqueListeners: 0,
            }).success
        ).toBe(false);
    });

    it("should strip unknown keys", () => {
        const parsed = musicStatsSummarySchema.parse({
            totalPlays: 1,
            totalListenedMs: 2,
            uniqueTracks: 3,
            uniqueListeners: 4,
            legacy_column: "nope",
        });

        expect(parsed).not.toHaveProperty("legacy_column");
    });
});