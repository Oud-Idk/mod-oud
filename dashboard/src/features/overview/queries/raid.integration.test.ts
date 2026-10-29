import { describe, expect, it, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { getActiveRaid } from "./raid";

const GUILD_A = "123456789012345678";
const GUILD_B = "987654321098765432";

async function cleanupRaidState(guildId: string): Promise<void> {
    await db.query(`DELETE FROM raid_active_state WHERE guild_id = $1::bigint`, [guildId]);
}

async function seedActiveRaid(guildId: string, startedAt: Date): Promise<void> {
    await db.query(
        `INSERT INTO raid_active_state (guild_id, raid_start_time, pre_raid_snapshot)
         VALUES ($1::bigint, $2::timestamptz, '{}'::jsonb)
         ON CONFLICT (guild_id) DO UPDATE SET raid_start_time = EXCLUDED.raid_start_time`,
        [guildId, startedAt]
    );
}

describe("active raid against a real database", () => {
    beforeEach(async () => {
        await cleanupRaidState(GUILD_A);
        await cleanupRaidState(GUILD_B);
    });

    it("returns null when no raid is active for the requested guild", async () => {
        // Guild B has a raid, Guild A does not
        await seedActiveRaid(GUILD_B, new Date());

        const raidA = await getActiveRaid(GUILD_A);
        expect(raidA).toBeNull();
    });

    it("returns the raid start time for the requested guild", async () => {
        const startedAt = new Date(Date.now() - 15 * 60_000);
        startedAt.setUTCMilliseconds(0); // Postgres timestamptz alignment

        await seedActiveRaid(GUILD_A, startedAt);

        const raid = await getActiveRaid(GUILD_A);
        expect(raid).toEqual({ startedAt });
    });

    it("returns null once the raid row is deleted (raid resolved)", async () => {
        const startedAt = new Date();
        startedAt.setUTCMilliseconds(0);
        await seedActiveRaid(GUILD_A, startedAt);
        expect(await getActiveRaid(GUILD_A)).toEqual({ startedAt });
        await cleanupRaidState(GUILD_A);
        expect(await getActiveRaid(GUILD_A)).toBeNull();
    });
});