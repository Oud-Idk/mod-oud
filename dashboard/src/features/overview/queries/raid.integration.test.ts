import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getActiveRaid } from "./raid";

const GUILD_A = "123456789012345678";
const GUILD_B = "987654321098765432";

async function seedActiveRaid(guildId: string, startedAt: Date): Promise<void> {
    await db.query(
        `INSERT INTO raid_active_state (guild_id, raid_start_time, pre_raid_snapshot)
         VALUES ($1::bigint, $2::timestamptz, '{}'::jsonb)`,
        [guildId, startedAt]
    );
}

describe("active raid against a real database", () => {
    it("returns null for a guild with no active raid", async () => {
        await seedActiveRaid(GUILD_B, new Date());

        expect(await getActiveRaid(GUILD_A)).toBeNull();
    });

    it("returns the raid start time for the requested guild", async () => {
        const startedAt = new Date(Date.now() - 15 * 60_000);
        startedAt.setUTCMilliseconds(0);
        await seedActiveRaid(GUILD_A, startedAt);

        expect(await getActiveRaid(GUILD_A)).toEqual({ startedAt });
    });
});
