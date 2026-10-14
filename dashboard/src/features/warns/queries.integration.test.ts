import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
    deleteWarnThresholds,
    getWarnThresholds,
    saveWarnThresholds,
    searchWarns,
} from "./queries";
import type { SaveWarnThresholdInput } from "./types";

const GUILD_A = "123456789012345678";
const GUILD_B = "987654321098765432";
const USER_A = "111111111111111111";
const USER_B = "222222222222222222";
const MOD_A = "333333333333333333";
const ROLE_1 = "444444444444444444";
const ROLE_2 = "555555555555555555";

async function seedWarn(
    guildId: string,
    userId: string,
    reason: string,
    createdAt: string,
    isActive = true
): Promise<void> {
    await db.query(
        `INSERT INTO warns (guild_id, moderator_id, user_id, reason, created_at, is_active)
         VALUES ($1::bigint, $2::bigint, $3::bigint, $4, $5::timestamptz, $6)`,
        [guildId, MOD_A, userId, reason, createdAt, isActive]
    );
}

describe("warns against a real database", () => {
    it("returns an empty array when a user has no warns", async () => {
        expect(await searchWarns(GUILD_A, USER_A)).toEqual([]);
    });

    it("maps warn rows with bigint ids as strings and parses timestamps", async () => {
        await seedWarn(GUILD_A, USER_A, "Spam", "2026-01-02T00:00:00.000Z");

        const [warn] = await searchWarns(GUILD_A, USER_A);

        expect(typeof warn.id).toBe("string");
        expect(warn.guild_id).toBe(GUILD_A);
        expect(warn.user_id).toBe(USER_A);
        expect(warn.moderator_id).toBe(MOD_A);
        expect(warn.reason).toBe("Spam");
        expect(warn.created_at).toEqual(new Date("2026-01-02T00:00:00.000Z"));
        expect(warn.is_active).toBe(true);
    });

    it("orders warns by created_at descending", async () => {
        await seedWarn(GUILD_A, USER_A, "old", "2026-01-01T00:00:00.000Z");
        await seedWarn(GUILD_A, USER_A, "new", "2026-01-03T00:00:00.000Z");
        await seedWarn(GUILD_A, USER_A, "mid", "2026-01-02T00:00:00.000Z");

        expect((await searchWarns(GUILD_A, USER_A)).map((w) => w.reason)).toEqual([
            "new",
            "mid",
            "old",
        ]);
    });

    it("scopes warns to both guild and user", async () => {
        await seedWarn(GUILD_A, USER_A, "own", "2026-01-01T00:00:00.000Z");
        await seedWarn(GUILD_A, USER_B, "other user", "2026-01-01T00:00:00.000Z");
        await seedWarn(GUILD_B, USER_A, "other guild", "2026-01-01T00:00:00.000Z");

        const rows = await searchWarns(GUILD_A, USER_A);

        expect(rows).toHaveLength(1);
        expect(rows[0].reason).toBe("own");
    });

    it("defaults a missing reason to the schema default", async () => {
        await db.query(
            `INSERT INTO warns (guild_id, moderator_id, user_id)
             VALUES ($1::bigint, $2::bigint, $3::bigint)`,
            [GUILD_A, MOD_A, USER_A]
        );

        const [warn] = await searchWarns(GUILD_A, USER_A);

        expect(warn.reason).toBe("No reason provided");
    });
});

describe("warn thresholds against a real database", () => {
    it("returns an empty array for a guild with no thresholds", async () => {
        expect(await getWarnThresholds(GUILD_A)).toEqual([]);
    });

    it("round-trips a threshold with roles as strings and null arrays as empty", async () => {
        await saveWarnThresholds(GUILD_A, [
            {
                warnCount: 3,
                actionType: ["KICK", "ROLE_ADD"],
                rolesToAdd: [ROLE_1, ROLE_2],
                rolesToRemove: [],
                duration: null,
            },
        ]);

        const [threshold] = await getWarnThresholds(GUILD_A);

        expect(typeof threshold.id).toBe("number");
        expect(threshold.guild_id).toBe(GUILD_A);
        expect(threshold.warn_count).toBe(3);
        expect(threshold.action_type).toEqual(["KICK", "ROLE_ADD"]);
        expect(threshold.roles_to_add).toEqual([ROLE_1, ROLE_2]);
        expect(threshold.roles_to_remove).toEqual([]);
        expect(threshold.duration).toBeNull();
    });

    it("returns null roles when stored as NULL, since the select does not coalesce", async () => {
        await db.query(
            `INSERT INTO warn_thresholds (guild_id, warn_count, action_type, roles_to_add, roles_to_remove)
             VALUES ($1::bigint, 2, ARRAY['KICK']::MODERATION_ACTION[], NULL, NULL)`,
            [GUILD_A]
        );

        const [threshold] = await getWarnThresholds(GUILD_A);

        expect(threshold.roles_to_add).toBeNull();
        expect(threshold.roles_to_remove).toBeNull();
    });

    it("orders thresholds by warn_count ascending", async () => {
        await saveWarnThresholds(GUILD_A, [
            { warnCount: 5, actionType: ["BAN"], rolesToAdd: [], rolesToRemove: [], duration: null },
            { warnCount: 2, actionType: ["TIMEOUT"], rolesToAdd: [], rolesToRemove: [], duration: 60 },
        ]);

        expect((await getWarnThresholds(GUILD_A)).map((t) => t.warn_count)).toEqual([2, 5]);
    });

    it("keeps one guild's thresholds out of another's", async () => {
        await saveWarnThresholds(GUILD_A, [
            { warnCount: 3, actionType: ["KICK"], rolesToAdd: [], rolesToRemove: [], duration: null },
        ]);
        await saveWarnThresholds(GUILD_B, [
            { warnCount: 3, actionType: ["BAN"], rolesToAdd: [], rolesToRemove: [], duration: null },
        ]);

        const a = await getWarnThresholds(GUILD_A);
        const b = await getWarnThresholds(GUILD_B);

        expect(a).toHaveLength(1);
        expect(a[0].action_type).toEqual(["KICK"]);
        expect(b).toHaveLength(1);
        expect(b[0].action_type).toEqual(["BAN"]);
    });

    it("upserts on (guild_id, warn_count) without duplicating", async () => {
        await saveWarnThresholds(GUILD_A, [
            { warnCount: 3, actionType: ["KICK"], rolesToAdd: [], rolesToRemove: [], duration: null },
        ]);
        await saveWarnThresholds(GUILD_A, [
            {
                warnCount: 3,
                actionType: ["BAN"],
                rolesToAdd: [ROLE_1],
                rolesToRemove: [],
                duration: null,
            },
        ]);

        const rows = await getWarnThresholds(GUILD_A);

        expect(rows).toHaveLength(1);
        expect(rows[0].action_type).toEqual(["BAN"]);
        expect(rows[0].roles_to_add).toEqual([ROLE_1]);
    });

    it("prunes thresholds whose warn_count is no longer present", async () => {
        await saveWarnThresholds(GUILD_A, [
            { warnCount: 2, actionType: ["KICK"], rolesToAdd: [], rolesToRemove: [], duration: null },
            { warnCount: 5, actionType: ["BAN"], rolesToAdd: [], rolesToRemove: [], duration: null },
        ]);

        await saveWarnThresholds(GUILD_A, [
            { warnCount: 2, actionType: ["BAN"], rolesToAdd: [], rolesToRemove: [], duration: null },
        ]);

        expect((await getWarnThresholds(GUILD_A)).map((t) => t.warn_count)).toEqual([2]);
    });

    it("does not prune another guild's thresholds", async () => {
        await saveWarnThresholds(GUILD_A, [
            { warnCount: 4, actionType: ["KICK"], rolesToAdd: [], rolesToRemove: [], duration: null },
        ]);
        await saveWarnThresholds(GUILD_B, [
            { warnCount: 4, actionType: ["KICK"], rolesToAdd: [], rolesToRemove: [], duration: null },
        ]);

        await saveWarnThresholds(GUILD_A, []);

        expect(await getWarnThresholds(GUILD_A)).toEqual([]);
        expect(await getWarnThresholds(GUILD_B)).toHaveLength(1);
    });

    it("treats an empty save as a delete of all thresholds", async () => {
        await saveWarnThresholds(GUILD_A, [
            { warnCount: 3, actionType: ["KICK"], rolesToAdd: [], rolesToRemove: [], duration: null },
        ]);

        await saveWarnThresholds(GUILD_A, []);

        expect(await getWarnThresholds(GUILD_A)).toEqual([]);
    });

    it("round-trips a timeout duration", async () => {
        await saveWarnThresholds(GUILD_A, [
            {
                warnCount: 1,
                actionType: ["TIMEOUT"],
                rolesToAdd: [],
                rolesToRemove: [],
                duration: 300,
            },
        ]);

        expect((await getWarnThresholds(GUILD_A))[0].duration).toBe(300);
    });

    it("rolls back the whole transaction when a duplicate warn_count is submitted", async () => {
        await saveWarnThresholds(GUILD_A, [
            { warnCount: 3, actionType: ["KICK"], rolesToAdd: [], rolesToRemove: [], duration: null },
        ]);

        await expect(
            saveWarnThresholds(GUILD_A, [
                { warnCount: 4, actionType: ["KICK"], rolesToAdd: [], rolesToRemove: [], duration: null },
                { warnCount: 4, actionType: ["BAN"], rolesToAdd: [], rolesToRemove: [], duration: null },
            ])
        ).rejects.toThrow();

        expect((await getWarnThresholds(GUILD_A)).map((t) => t.warn_count)).toEqual([3]);
    });

    it("rejects an unknown moderation action at the database", async () => {
        await expect(
            saveWarnThresholds(GUILD_A, [
                {
                    warnCount: 1,
                    actionType: ["NOT_A_REAL_ACTION" as any],
                    rolesToAdd: [],
                    rolesToRemove: [],
                    duration: null,
                },
            ])
        ).rejects.toThrow();
    });

    it("deletes thresholds by id scoped to the guild", async () => {
        await saveWarnThresholds(GUILD_A, [
            { warnCount: 2, actionType: ["KICK"], rolesToAdd: [], rolesToRemove: [], duration: null },
            { warnCount: 5, actionType: ["BAN"], rolesToAdd: [], rolesToRemove: [], duration: null },
        ]);
        await saveWarnThresholds(GUILD_B, [
            { warnCount: 2, actionType: ["KICK"], rolesToAdd: [], rolesToRemove: [], duration: null },
        ]);

        const ownId = (await getWarnThresholds(GUILD_A))[0].id;
        const foreignId = (await getWarnThresholds(GUILD_B))[0].id;

        await deleteWarnThresholds(GUILD_A, [ownId, foreignId]);

        expect(await getWarnThresholds(GUILD_A)).toHaveLength(1);
        expect(await getWarnThresholds(GUILD_B)).toHaveLength(1);
    });

    it("treats an empty delete as a no-op", async () => {
        await saveWarnThresholds(GUILD_A, [
            { warnCount: 3, actionType: ["KICK"], rolesToAdd: [], rolesToRemove: [], duration: null },
        ]);

        await deleteWarnThresholds(GUILD_A, []);

        expect(await getWarnThresholds(GUILD_A)).toHaveLength(1);
    });

    it("allows storing null roles and a null duration directly", async () => {
        await db.query(
            `INSERT INTO warn_thresholds (guild_id, warn_count, action_type, roles_to_add, roles_to_remove, duration)
             VALUES ($1::bigint, 9, ARRAY['KICK']::MODERATION_ACTION[], NULL, NULL, NULL)`,
            [GUILD_A]
        );

        const [threshold] = await getWarnThresholds(GUILD_A);
        expect(threshold.roles_to_add).toBeNull();
        expect(threshold.roles_to_remove).toBeNull();
        expect(threshold.duration).toBeNull();
    });
});
