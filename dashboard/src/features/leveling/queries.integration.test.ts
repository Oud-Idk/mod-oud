import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
    deleteLevelRewards,
    deleteXpMultipliers,
    fetchMoreLevels,
    getLevelingConfig,
    getLevelRewards,
    getLevels,
    getXpMultipliers,
    saveLevelingConfig,
    saveLevelRewards,
    saveXpMultipliers,
} from "./queries";
import { defaultLevelingConfig } from "./types";

const GUILD_A = "123456789012345678";
const GUILD_B = "987654321098765432";
const USER_1 = "111111111111111111";
const USER_2 = "222222222222222222";
const USER_3 = "333333333333333333";
const ROLE_1 = "444444444444444444";
const ROLE_2 = "555555555555555555";
const CHANNEL_1 = "666666666666666666";

async function seedLevel(
    guildId: string,
    userId: string,
    xp: number,
    level = 1
): Promise<void> {
    await db.query(
        `INSERT INTO levels (guild_id, user_id, cumulative_xp, current_level, current_xp)
         VALUES ($1::bigint, $2::bigint, $3, $4, $5)
         ON CONFLICT (guild_id, user_id)
         DO UPDATE SET cumulative_xp = EXCLUDED.cumulative_xp,
                       current_level = EXCLUDED.current_level,
                       current_xp = EXCLUDED.current_xp`,
        [guildId, userId, xp, level, xp]
    );
}

async function seedUsername(userId: string, username: string): Promise<void> {
    await db.query(
        `INSERT INTO discord_users (user_id, username)
         VALUES ($1::bigint, $2)
         ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username`,
        [userId, username]
    );
}

describe("level leaderboard against a real database", () => {
    it("returns an empty array for a guild with no levels", async () => {
        expect(await getLevels(GUILD_A)).toEqual([]);
    });

    it("orders by cumulative_xp descending with snowflakes as strings", async () => {
        await seedLevel(GUILD_A, USER_1, 100);
        await seedLevel(GUILD_A, USER_2, 300);
        await seedLevel(GUILD_A, USER_3, 200);

        const rows = await getLevels(GUILD_A);

        expect(rows.map((r) => r.userId)).toEqual([USER_2, USER_3, USER_1]);
        expect(rows[0].guildId).toBe(GUILD_A);
        expect(typeof rows[0].userId).toBe("string");
        expect(typeof rows[0].cumulativeXp).toBe("number");
    });

    // No discord_users row, so the LEFT JOIN finds nothing and COALESCE
    // supplies the empty username the schema promises.
    it("falls back to an empty username when the user is unknown", async () => {
        await seedLevel(GUILD_A, USER_1, 100);

        const [row] = await getLevels(GUILD_A);

        expect(row.username).toBe("");
    });

    it("uses the discord username when present", async () => {
        await seedLevel(GUILD_A, USER_1, 100);
        await seedUsername(USER_1, "SpicyWolf");

        const [row] = await getLevels(GUILD_A);

        expect(row.username).toBe("SpicyWolf");
    });

    it("scopes the leaderboard to the guild", async () => {
        await seedLevel(GUILD_A, USER_1, 100);
        await seedLevel(GUILD_B, USER_2, 999);

        const rows = await getLevels(GUILD_A);

        expect(rows).toHaveLength(1);
        expect(rows[0].userId).toBe(USER_1);
    });

    // The cursor is strict, so tied scores fall out of the next page.
    it("pages strictly below the cursor", async () => {
        await seedLevel(GUILD_A, USER_1, 300);
        await seedLevel(GUILD_A, USER_2, 200);
        await seedLevel(GUILD_A, USER_3, 100);

        const rows = await fetchMoreLevels(GUILD_A, 200);

        expect(rows.map((r) => r.userId)).toEqual([USER_3]);
    });

    it("returns an empty array for an unknown guild instead of throwing", async () => {
        expect(await fetchMoreLevels(GUILD_A, 500)).toEqual([]);
    });
});

describe("xp multipliers against a real database", () => {
    it("returns an empty array for a guild with no multipliers", async () => {
        expect(await getXpMultipliers(GUILD_A)).toEqual([]);
    });

    it("round-trips a saved multiplier with the target id as a string", async () => {
        await saveXpMultipliers(GUILD_A, [
            { targetId: ROLE_1, targetType: "ROLE", multiplier: 2.5 },
        ]);

        const [row] = await getXpMultipliers(GUILD_A);

        expect(row.targetId).toBe(ROLE_1);
        expect(row.targetType).toBe("ROLE");
        expect(row.multiplier).toBeCloseTo(2.5);
    });

    // The conflict target is (guild_id, target_id), and only the multiplier
    // is refreshed, so a re-save with another type keeps the original one.
    it("upserts on (guild_id, target_id) without duplicating", async () => {
        await saveXpMultipliers(GUILD_A, [
            { targetId: ROLE_1, targetType: "ROLE", multiplier: 2 },
        ]);
        await saveXpMultipliers(GUILD_A, [
            { targetId: ROLE_1, targetType: "CHANNEL", multiplier: 3 },
        ]);

        const rows = await getXpMultipliers(GUILD_A);

        expect(rows).toHaveLength(1);
        expect(rows[0].multiplier).toBeCloseTo(3);
        expect(rows[0].targetType).toBe("ROLE");
    });

    it("keeps one guild's multiplier out of another's", async () => {
        await saveXpMultipliers(GUILD_A, [
            { targetId: ROLE_1, targetType: "ROLE", multiplier: 2 },
        ]);
        await saveXpMultipliers(GUILD_B, [
            { targetId: ROLE_1, targetType: "ROLE", multiplier: 9 },
        ]);

        const [row] = await getXpMultipliers(GUILD_A);

        expect(row.multiplier).toBeCloseTo(2);
    });

    it("deletes only the requested targets in the guild", async () => {
        await saveXpMultipliers(GUILD_A, [
            { targetId: ROLE_1, targetType: "ROLE", multiplier: 2 },
            { targetId: CHANNEL_1, targetType: "CHANNEL", multiplier: 1.5 },
        ]);
        await saveXpMultipliers(GUILD_B, [
            { targetId: ROLE_1, targetType: "ROLE", multiplier: 9 },
        ]);

        await deleteXpMultipliers(GUILD_A, [ROLE_1]);

        expect((await getXpMultipliers(GUILD_A)).map((r) => r.targetId)).toEqual([CHANNEL_1]);
        expect(await getXpMultipliers(GUILD_B)).toHaveLength(1);
    });

    it("treats empty saves and deletes as no-ops", async () => {
        await saveXpMultipliers(GUILD_A, []);
        await deleteXpMultipliers(GUILD_A, []);

        expect(await getXpMultipliers(GUILD_A)).toEqual([]);
    });

    // u.target_id::bigint rejects the value after the statement starts.
    it("rejects a non-numeric target id", async () => {
        await expect(
            saveXpMultipliers(GUILD_A, [
                { targetId: "not-a-number", targetType: "ROLE", multiplier: 2 },
            ])
        ).rejects.toThrow();
    });
});

describe("level rewards against a real database", () => {
    it("returns an empty array for a guild with no rewards", async () => {
        expect(await getLevelRewards(GUILD_A)).toEqual([]);
    });

    it("round-trips roles as strings through the bigint array", async () => {
        await saveLevelRewards(GUILD_A, [
            { levelRequirement: 5, rolesToAdd: [ROLE_1, ROLE_2], removePreviousRoles: true },
        ]);

        const [row] = await getLevelRewards(GUILD_A);

        expect(row.levelRequirement).toBe(5);
        expect(row.rolesToAdd).toEqual([ROLE_1, ROLE_2]);
        expect(row.removePreviousRoles).toBe(true);
        expect(typeof row.id).toBe("number");
    });

    it("upserts on (guild_id, level_requirement) without duplicating", async () => {
        await saveLevelRewards(GUILD_A, [
            { levelRequirement: 5, rolesToAdd: [ROLE_1], removePreviousRoles: false },
        ]);
        await saveLevelRewards(GUILD_A, [
            { levelRequirement: 5, rolesToAdd: [ROLE_2], removePreviousRoles: true },
        ]);

        const rows = await getLevelRewards(GUILD_A);

        expect(rows).toHaveLength(1);
        expect(rows[0].rolesToAdd).toEqual([ROLE_2]);
        expect(rows[0].removePreviousRoles).toBe(true);
    });

    // A NULL array in the table still parses, because the select coalesces it.
    it("reads a null roles array as empty", async () => {
        await db.query(
            `INSERT INTO level_rewards (guild_id, level_requirement, roles_to_add)
             VALUES ($1::bigint, 5, NULL)`,
            [GUILD_A]
        );

        const [row] = await getLevelRewards(GUILD_A);

        expect(row.rolesToAdd).toEqual([]);
    });

    it("treats an empty save as a no-op", async () => {
        await saveLevelRewards(GUILD_A, []);

        expect(await getLevelRewards(GUILD_A)).toEqual([]);
    });

    // roles_to_add::bigint[] rejects the value inside JSON_TO_RECORDSET.
    it("rejects a non-numeric role id", async () => {
        await expect(
            saveLevelRewards(GUILD_A, [
                { levelRequirement: 5, rolesToAdd: ["abc"], removePreviousRoles: false },
            ])
        ).rejects.toThrow();
    });

    it("deletes by id scoped to the guild", async () => {
        await saveLevelRewards(GUILD_A, [
            { levelRequirement: 5, rolesToAdd: [ROLE_1], removePreviousRoles: false },
        ]);
        await saveLevelRewards(GUILD_B, [
            { levelRequirement: 5, rolesToAdd: [ROLE_1], removePreviousRoles: false },
        ]);
        const ownId = (await getLevelRewards(GUILD_A))[0].id;
        const foreignId = (await getLevelRewards(GUILD_B))[0].id;
        if (ownId === undefined || foreignId === undefined) {
            throw new Error("seeded reward is missing an id");
        }

        await deleteLevelRewards(GUILD_A, [ownId, foreignId]);

        expect(await getLevelRewards(GUILD_A)).toEqual([]);
        expect(await getLevelRewards(GUILD_B)).toHaveLength(1);
    });

    it("treats an empty delete as a no-op", async () => {
        await saveLevelRewards(GUILD_A, [
            { levelRequirement: 5, rolesToAdd: [ROLE_1], removePreviousRoles: false },
        ]);

        await deleteLevelRewards(GUILD_A, []);

        expect(await getLevelRewards(GUILD_A)).toHaveLength(1);
    });
});

describe("leveling config against a real database", () => {
    it("returns defaults when the guild has no config row", async () => {
        const config = await getLevelingConfig(GUILD_A);

        expect(config.levelCap).toBe(defaultLevelingConfig.levelCap);
        expect(config.notify.scope).toBe("NONE");
    });

    it("round-trips a saved config through the JSONB column", async () => {
        await saveLevelingConfig(GUILD_A, {
            ...defaultLevelingConfig,
            levelCap: 100,
            keepLevelOnLeave: true,
        });

        const loaded = await getLevelingConfig(GUILD_A);

        expect(loaded.levelCap).toBe(100);
        expect(loaded.keepLevelOnLeave).toBe(true);
    });

    it("keeps one guild's config out of another's", async () => {
        await saveLevelingConfig(GUILD_A, { ...defaultLevelingConfig, levelCap: 77 });

        expect((await getLevelingConfig(GUILD_B)).levelCap).toBe(
            defaultLevelingConfig.levelCap
        );
    });
});
