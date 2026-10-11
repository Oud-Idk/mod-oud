import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { getMusicStatsSummary, getTopListeners, getTopTracks } from "./queries";

const GUILD_A = "123456789012345678";
const GUILD_B = "987654321098765432";

// Both larger than Number.MAX_SAFE_INTEGER, so anything that routes a snowflake
// through a JS number loses precision. Both still inside BIGINT, whose ceiling
// is 9223372036854775807.
const USER_A = "1234567890123456789";
const USER_B = "987654321098765432";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number): string {
    return new Date(Date.now() - days * DAY_MS).toISOString();
}

interface EventOverrides {
    userId?: string;
    title?: string;
    artist?: string;
    trackUrl?: string | null;
    durationMs?: number | null;
    listenedMs?: number | null;
    playedAt?: string;
}

async function seedEvent(guildId: string, overrides: EventOverrides = {}): Promise<void> {
    const {
        userId = USER_A,
        title = "Bohemian Rhapsody",
        artist = "Queen",
        trackUrl = "https://example.com/track/1",
        durationMs = 200_000,
        listenedMs = 180_000,
        playedAt = daysAgo(1),
    } = overrides;

    await db.query(
        `INSERT INTO music_play_events
             (guild_id, user_id, title, artist, track_url, duration_ms, listened_ms, played_at)
         VALUES ($1::bigint, $2::bigint, $3, $4, $5, $6::bigint, $7::bigint, $8::timestamptz)`,
        [guildId, userId, title, artist, trackUrl, durationMs, listenedMs, playedAt]
    );
}

async function seedDiscordUser(userId: string, username: string): Promise<void> {
    await db.query("INSERT INTO discord_users (user_id, username) VALUES ($1::bigint, $2)", [
        userId,
        username,
    ]);
}

describe("music stats against a real database", () => {
    describe("getMusicStatsSummary", () => {
        it("returns an all-zero summary for a guild with no plays", async () => {
            const summary = await getMusicStatsSummary(GUILD_A);

            expect(summary).toEqual({
                totalPlays: 0,
                totalListenedMs: 0,
                uniqueTracks: 0,
                uniqueListeners: 0,
            });
        });

        it("counts plays, unique tracks and unique listeners", async () => {
            await seedEvent(GUILD_A, { userId: USER_A, trackUrl: "https://example.com/1" });
            await seedEvent(GUILD_A, { userId: USER_A, trackUrl: "https://example.com/1" });
            await seedEvent(GUILD_A, { userId: USER_B, trackUrl: "https://example.com/2" });

            const summary = await getMusicStatsSummary(GUILD_A);

            expect(summary.totalPlays).toBe(3);
            expect(summary.uniqueTracks).toBe(2);
            expect(summary.uniqueListeners).toBe(2);
        });

        it("excludes another guild's plays", async () => {
            await seedEvent(GUILD_A);
            await seedEvent(GUILD_B);
            await seedEvent(GUILD_B);

            expect((await getMusicStatsSummary(GUILD_A)).totalPlays).toBe(1);
            expect((await getMusicStatsSummary(GUILD_B)).totalPlays).toBe(2);
        });

        it("excludes plays older than the 30 day lookback", async () => {
            await seedEvent(GUILD_A, { playedAt: daysAgo(1) });
            await seedEvent(GUILD_A, { playedAt: daysAgo(29) });
            await seedEvent(GUILD_A, { playedAt: daysAgo(45) });

            expect((await getMusicStatsSummary(GUILD_A)).totalPlays).toBe(2);
        });

        it("sums listened_ms when it is recorded", async () => {
            await seedEvent(GUILD_A, { durationMs: 200_000, listenedMs: 180_000 });
            await seedEvent(GUILD_A, { durationMs: 200_000, listenedMs: 120_000 });

            const summary = await getMusicStatsSummary(GUILD_A);

            // BIGINT arrives as a string from pg, and the schema coerces it.
            expect(summary.totalListenedMs).toBe(300_000);
            expect(typeof summary.totalListenedMs).toBe("number");
        });

        // A zero listened_ms means the bot never recorded how far the user got,
        // so the total falls back to the full track duration rather than counting
        // nothing at all.
        it("falls back to duration_ms when listened_ms is zero", async () => {
            await seedEvent(GUILD_A, { durationMs: 200_000, listenedMs: 0 });

            expect((await getMusicStatsSummary(GUILD_A)).totalListenedMs).toBe(200_000);
        });

        it("falls back to duration_ms when listened_ms is null", async () => {
            await seedEvent(GUILD_A, { durationMs: 200_000, listenedMs: null });

            expect((await getMusicStatsSummary(GUILD_A)).totalListenedMs).toBe(200_000);
        });

        it("counts zero listened time when both duration and listened are null", async () => {
            await seedEvent(GUILD_A, { durationMs: null, listenedMs: null });

            expect((await getMusicStatsSummary(GUILD_A)).totalListenedMs).toBe(0);
        });

        // COUNT(DISTINCT col) skips NULLs, so plays with no track_url do not
        // inflate the unique count.
        it("does not count a null track_url towards uniqueTracks", async () => {
            await seedEvent(GUILD_A, { trackUrl: null });
            await seedEvent(GUILD_A, { trackUrl: null });
            await seedEvent(GUILD_A, { trackUrl: "https://example.com/1" });

            const summary = await getMusicStatsSummary(GUILD_A);

            expect(summary.totalPlays).toBe(3);
            expect(summary.uniqueTracks).toBe(1);
        });

        it("treats two different urls for the same song as two unique tracks", async () => {
            await seedEvent(GUILD_A, { title: "Song", artist: "Artist", trackUrl: "https://a" });
            await seedEvent(GUILD_A, { title: "Song", artist: "Artist", trackUrl: "https://b" });

            expect((await getMusicStatsSummary(GUILD_A)).uniqueTracks).toBe(2);
        });

        // INTEGER tops out at 2147483647 ms, roughly 24.8 days. A busy guild
        // accumulates past that inside the 30 day window, so the column has to
        // stay a BIGINT or the aggregate overflows.
        it("holds a listened total beyond the INTEGER ceiling", async () => {
            const longListen = 1_000_000_000;
            await seedEvent(GUILD_A, { durationMs: longListen, listenedMs: longListen });
            await seedEvent(GUILD_A, { durationMs: longListen, listenedMs: longListen });
            await seedEvent(GUILD_A, { durationMs: longListen, listenedMs: longListen });

            const summary = await getMusicStatsSummary(GUILD_A);

            expect(summary.totalListenedMs).toBe(3_000_000_000);
            expect(Number.isInteger(summary.totalListenedMs)).toBe(true);
        });
    });

    describe("getTopTracks", () => {
        it("returns an empty array for a guild with no plays", async () => {
            expect(await getTopTracks(GUILD_A)).toEqual([]);
        });

        it("groups repeated plays of the same track into one row", async () => {
            await seedEvent(GUILD_A, {
                title: "Bohemian Rhapsody",
                artist: "Queen",
                trackUrl: "https://example.com/track/1",
                listenedMs: 100_000,
            });
            await seedEvent(GUILD_A, { trackUrl: "https://example.com/track/1", listenedMs: 150_000 });

            const tracks = await getTopTracks(GUILD_A);

            expect(tracks).toHaveLength(1);
            expect(tracks[0]).toEqual({
                title: "Bohemian Rhapsody",
                artist: "Queen",
                trackUrl: "https://example.com/track/1",
                plays: 2,
                totalListenedMs: 250_000,
            });
        });

        it("orders tracks by play count descending", async () => {
            await seedEvent(GUILD_A, { title: "One", artist: "A", trackUrl: "https://1" });
            await seedEvent(GUILD_A, { title: "Two", artist: "A", trackUrl: "https://2" });
            await seedEvent(GUILD_A, { title: "Two", artist: "A", trackUrl: "https://2" });
            await seedEvent(GUILD_A, { title: "Three", artist: "A", trackUrl: "https://3" });
            await seedEvent(GUILD_A, { title: "Three", artist: "A", trackUrl: "https://3" });
            await seedEvent(GUILD_A, { title: "Three", artist: "A", trackUrl: "https://3" });

            const titles = (await getTopTracks(GUILD_A)).map((track) => track.title);

            expect(titles).toEqual(["Three", "Two", "One"]);
        });

        it("keeps the same title by different artists apart", async () => {
            await seedEvent(GUILD_A, { title: "Song", artist: "Artist A", trackUrl: "https://a" });
            await seedEvent(GUILD_A, { title: "Song", artist: "Artist B", trackUrl: "https://b" });

            const tracks = await getTopTracks(GUILD_A);

            expect(tracks).toHaveLength(2);
            expect(tracks.map((track) => track.artist).sort()).toEqual(["Artist A", "Artist B"]);
        });

        it("excludes another guild's plays", async () => {
            await seedEvent(GUILD_A, { title: "Mine" });
            await seedEvent(GUILD_B, { title: "Theirs" });

            const tracks = await getTopTracks(GUILD_A);

            expect(tracks).toHaveLength(1);
            expect(tracks[0].title).toBe("Mine");
        });

        it("holds a per-track listened total beyond the INTEGER ceiling", async () => {
            const longListen = 1_500_000_000;
            await seedEvent(GUILD_A, { title: "Epic", durationMs: longListen, listenedMs: longListen });
            await seedEvent(GUILD_A, { title: "Epic", durationMs: longListen, listenedMs: longListen });

            const [track] = await getTopTracks(GUILD_A);

            expect(track.plays).toBe(2);
            expect(track.totalListenedMs).toBe(3_000_000_000);
        });

        it("excludes plays older than the 30 day lookback", async () => {
            await seedEvent(GUILD_A, { title: "Recent", playedAt: daysAgo(2) });
            await seedEvent(GUILD_A, { title: "Ancient", playedAt: daysAgo(40) });

            const titles = (await getTopTracks(GUILD_A)).map((track) => track.title);

            expect(titles).toEqual(["Recent"]);
        });

        it("honours the limit parameter", async () => {
            await seedEvent(GUILD_A, { title: "One", artist: "A", trackUrl: "https://1" });
            await seedEvent(GUILD_A, { title: "Two", artist: "A", trackUrl: "https://2" });
            await seedEvent(GUILD_A, { title: "Three", artist: "A", trackUrl: "https://3" });

            expect(await getTopTracks(GUILD_A, 2)).toHaveLength(2);
        });

        it("returns a null trackUrl for a play recorded without one", async () => {
            await seedEvent(GUILD_A, { trackUrl: null });

            const [track] = await getTopTracks(GUILD_A);

            expect(track.trackUrl).toBeNull();
        });

        it("applies the listened_ms fallback per row inside the group", async () => {
            await seedEvent(GUILD_A, {
                title: "Song",
                artist: "A",
                trackUrl: "https://1",
                durationMs: 300_000,
                listenedMs: 100_000,
            });
            await seedEvent(GUILD_A, {
                title: "Song",
                artist: "A",
                trackUrl: "https://1",
                durationMs: 300_000,
                listenedMs: 0,
            });

            const [track] = await getTopTracks(GUILD_A);

            expect(track.plays).toBe(2);
            expect(track.totalListenedMs).toBe(400_000);
        });
    });

    describe("getTopListeners", () => {
        it("returns an empty array for a guild with no plays", async () => {
            expect(await getTopListeners(GUILD_A)).toEqual([]);
        });

        it("groups a user's plays into one row with their username", async () => {
            await seedDiscordUser(USER_A, "spicy");
            await seedEvent(GUILD_A, { userId: USER_A, listenedMs: 100_000 });
            await seedEvent(GUILD_A, { userId: USER_A, listenedMs: 200_000 });

            const listeners = await getTopListeners(GUILD_A);

            expect(listeners).toHaveLength(1);
            expect(listeners[0]).toEqual({
                userId: USER_A,
                username: "spicy",
                plays: 2,
                totalListenedMs: 300_000,
            });
        });

        // The LEFT JOIN has to keep the play even though discord_users has no row,
        // otherwise a user who has since been renamed or removed disappears from
        // the leaderboard entirely.
        it("keeps a play whose discord_users row is missing", async () => {
            await seedEvent(GUILD_A, { userId: USER_A });

            const listeners = await getTopListeners(GUILD_A);

            expect(listeners).toHaveLength(1);
            expect(listeners[0]).toEqual({
                userId: USER_A,
                username: "",
                plays: 1,
                totalListenedMs: 180_000,
            });
        });

        it("preserves a snowflake userId that a JS number would round", async () => {
            await seedDiscordUser(USER_A, "spicy");
            await seedEvent(GUILD_A, { userId: USER_A });

            const [listener] = await getTopListeners(GUILD_A);

            expect(listener.userId).toBe(USER_A);
            // Past 2^53 a JS number cannot hold the low digits, so the string the
            // query returns must differ from its own lossy numeric rendering.
            expect(String(Number(listener.userId))).not.toBe(USER_A);
        });

        it("orders listeners by play count descending", async () => {
            await seedDiscordUser(USER_A, "alpha");
            await seedDiscordUser(USER_B, "beta");
            await seedEvent(GUILD_A, { userId: USER_B });
            await seedEvent(GUILD_A, { userId: USER_A });
            await seedEvent(GUILD_A, { userId: USER_A });

            const usernames = (await getTopListeners(GUILD_A)).map((listener) => listener.username);

            expect(usernames).toEqual(["alpha", "beta"]);
        });

        it("excludes another guild's plays", async () => {
            await seedDiscordUser(USER_A, "spicy");
            await seedEvent(GUILD_A, { userId: USER_A });
            await seedEvent(GUILD_B, { userId: USER_A });
            await seedEvent(GUILD_B, { userId: USER_A });

            const listeners = await getTopListeners(GUILD_A);

            expect(listeners).toHaveLength(1);
            expect(listeners[0].plays).toBe(1);
        });

        it("holds a per-listener listened total beyond the INTEGER ceiling", async () => {
            await seedDiscordUser(USER_A, "spicy");
            const longListen = 1_500_000_000;
            await seedEvent(GUILD_A, { userId: USER_A, durationMs: longListen, listenedMs: longListen });
            await seedEvent(GUILD_A, { userId: USER_A, durationMs: longListen, listenedMs: longListen });

            const [listener] = await getTopListeners(GUILD_A);

            expect(listener.plays).toBe(2);
            expect(listener.totalListenedMs).toBe(3_000_000_000);
        });

        it("excludes plays older than the 30 day lookback", async () => {
            await seedDiscordUser(USER_A, "spicy");
            await seedEvent(GUILD_A, { userId: USER_A, playedAt: daysAgo(2) });
            await seedEvent(GUILD_A, { userId: USER_A, playedAt: daysAgo(45) });

            const listeners = await getTopListeners(GUILD_A);

            expect(listeners).toHaveLength(1);
            expect(listeners[0].plays).toBe(1);
        });

        it("honours the limit parameter", async () => {
            await seedDiscordUser(USER_A, "alpha");
            await seedDiscordUser(USER_B, "beta");
            await seedEvent(GUILD_A, { userId: USER_A });
            await seedEvent(GUILD_A, { userId: USER_B });

            expect(await getTopListeners(GUILD_A, 1)).toHaveLength(1);
        });

        it("reflects a renamed username on the next read", async () => {
            await seedDiscordUser(USER_A, "old_name");
            await seedEvent(GUILD_A, { userId: USER_A });

            await db.query("UPDATE discord_users SET username = $2 WHERE user_id = $1::bigint", [
                USER_A,
                "new_name",
            ]);

            const [listener] = await getTopListeners(GUILD_A);

            expect(listener.username).toBe("new_name");
        });

        it("applies the listened_ms fallback per row inside the group", async () => {
            await seedDiscordUser(USER_A, "spicy");
            await seedEvent(GUILD_A, { userId: USER_A, durationMs: 300_000, listenedMs: 100_000 });
            await seedEvent(GUILD_A, { userId: USER_A, durationMs: 300_000, listenedMs: 0 });

            const listeners = await getTopListeners(GUILD_A);

            expect(listeners).toHaveLength(1);
            expect(listeners[0].plays).toBe(2);
            expect(listeners[0].totalListenedMs).toBe(400_000);
        });

        it("reads a play inserted straight into the table by the bot", async () => {
            // The bot writes music_play_events itself, so the dashboard has to
            // handle whatever shape it stores, including a null handle_uuid.
            await db.query(
                `INSERT INTO music_play_events (handle_uuid, guild_id, user_id, title, artist, track_url, duration_ms, listened_ms)
                 VALUES (NULL, $1::bigint, $2::bigint, 'Bot Play', 'Artist', NULL, 1000::bigint, NULL)`,
                [GUILD_A, USER_A]
            );

            const [listener] = await getTopListeners(GUILD_A);

            expect(listener.plays).toBe(1);
            expect(listener.totalListenedMs).toBe(1000);
        });
    });
});