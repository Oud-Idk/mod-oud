import { describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { getInviteLeaderboard } from "./queries";

const GUILD_A = "123456789012345678";
const GUILD_B = "987654321098765432";
const USER_1 = "111111111111111111";
const USER_2 = "222222222222222222";
const USER_3 = "333333333333333333";

async function seedCount(guildId: string, inviterId: string, count: number): Promise<void> {
    await db.query(
        `INSERT INTO inviter_counts (guild_id, inviter_id, count)
         VALUES ($1::bigint, $2::bigint, $3::bigint)
         ON CONFLICT (guild_id, inviter_id) DO UPDATE SET count = EXCLUDED.count`,
        [guildId, inviterId, count]
    );
}

async function seedDiscordUser(userId: string, username: string): Promise<void> {
    await db.query(
        `INSERT INTO discord_users (user_id, username)
         VALUES ($1::bigint, $2)
         ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username`,
        [userId, username]
    );
}

describe("invite leaderboard against a real database", () => {
    it("returns an empty array for a guild with no counts", async () => {
        expect(await getInviteLeaderboard(GUILD_A)).toEqual([]);
    });

    it("maps inviter_id as text and count as an integer", async () => {
        await seedCount(GUILD_A, USER_1, 10);

        const [entry] = await getInviteLeaderboard(GUILD_A);

        // BIGINT arrives as a string, so the ::TEXT cast keeps inviterId a string.
        expect(entry.inviterId).toBe(USER_1);
        expect(typeof entry.inviterId).toBe("string");
        expect(entry.count).toBe(10);
        expect(typeof entry.count).toBe("number");
    });

    it("joins the username, defaulting to empty when the user is unknown", async () => {
        await seedCount(GUILD_A, USER_1, 10);
        await seedCount(GUILD_A, USER_2, 5);
        await seedDiscordUser(USER_1, "alpha");

        const entries = await getInviteLeaderboard(GUILD_A);

        expect(entries[0].username).toBe("alpha");
        expect(entries[1].username).toBe("");
    });

    it("round-trips a zero count", async () => {
        await seedCount(GUILD_A, USER_1, 0);

        expect((await getInviteLeaderboard(GUILD_A))[0].count).toBe(0);
    });

    it("orders by count descending", async () => {
        await seedCount(GUILD_A, USER_1, 5);
        await seedCount(GUILD_A, USER_2, 30);
        await seedCount(GUILD_A, USER_3, 10);

        const entries = await getInviteLeaderboard(GUILD_A);

        expect(entries.map((e) => e.inviterId)).toEqual([USER_2, USER_3, USER_1]);
    });

    it("scopes counts to the guild", async () => {
        await seedCount(GUILD_A, USER_1, 10);
        await seedCount(GUILD_B, USER_2, 99);

        const entries = await getInviteLeaderboard(GUILD_A);

        expect(entries).toHaveLength(1);
        expect(entries[0].inviterId).toBe(USER_1);
    });

    it("paginates with limit and offset", async () => {
        await seedCount(GUILD_A, USER_1, 30);
        await seedCount(GUILD_A, USER_2, 20);
        await seedCount(GUILD_A, USER_3, 10);

        expect((await getInviteLeaderboard(GUILD_A, 2, 0)).map((e) => e.inviterId)).toEqual([
            USER_1,
            USER_2,
        ]);
        expect((await getInviteLeaderboard(GUILD_A, 2, 2)).map((e) => e.inviterId)).toEqual([
            USER_3,
        ]);
    });

    it("defaults to fifteen rows", async () => {
        for (let i = 0; i < 17; i++) {
            await seedCount(GUILD_A, String(500000000000000000n + BigInt(i)), i + 1);
        }

        expect(await getInviteLeaderboard(GUILD_A)).toHaveLength(15);
    });

    // count is BIGINT but the query casts it to ::INTEGER, so a count past
    // 2_147_483_647 aborts the query and the catch returns an empty array.
    it("returns an empty array when a count exceeds the int32 range", async () => {
        // The catch logs the overflow, which is expected here.
        const silence = vi.spyOn(console, "error").mockImplementation(() => {return});
        try {
            await seedCount(GUILD_A, USER_1, 3_000_000_000);

            expect(await getInviteLeaderboard(GUILD_A)).toEqual([]);
        } finally {
            silence.mockRestore();
        }
    });
});
