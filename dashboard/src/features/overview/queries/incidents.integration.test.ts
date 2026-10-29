import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getRecentIncidents } from "./incidents";

const GUILD_A = "123456789012345678";
const GUILD_B = "987654321098765432";

async function seedRaidEvent(
    guildId: string,
    eventType: "TRIGGERED" | "RESOLVED",
    details: Record<string, unknown> | null,
    createdAt: Date
): Promise<void> {
    await db.query(
        `INSERT INTO raid_event_logs (guild_id, event_type, details, created_at)
         VALUES ($1::bigint, $2::raid_event_type, $3::jsonb, $4::timestamptz)`,
        [guildId, eventType, details === null ? null : JSON.stringify(details), createdAt]
    );
}

describe("raid incidents against a real database", () => {
    it("describes each raid event from its stored type and details", async () => {
        const now = Date.now();
        await seedRaidEvent(GUILD_A, "TRIGGERED", { message: "- Current joins in the past minute: 12" }, new Date(now - 3_000));
        await seedRaidEvent(GUILD_A, "TRIGGERED", { moderator: "oud", manual: true }, new Date(now - 2_000));
        await seedRaidEvent(GUILD_A, "RESOLVED", null, new Date(now - 1_000));
        await seedRaidEvent(GUILD_B, "TRIGGERED", null, new Date(now));

        const raids = (await getRecentIncidents(GUILD_A, 10)).filter((i) => i.kind === "RAID");

        expect(raids.map((i) => [i.title, i.details, i.actor])).toEqual([
            ["Raid resolved", "Raid mode ended", "Anti-Raid Guard"],
            ["Raid mode started", "Started manually by @oud", "oud"],
            ["Raid detected", "12 joins in the last minute exceeded the threshold", "Anti-Raid Guard"],
        ]);
    });
});
