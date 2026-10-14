import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import redis from "@/lib/redis";
import {
    deleteBadWordRuleset,
    getBadWordRulesets,
    saveBadWordRuleset,
} from "./queries";
import {
    saveBadWordRulesetInputSchema,
    type SaveableBadWordRuleset,
} from "./types";

const GUILD_A = "123456789012345678";
const GUILD_B = "987654321098765432";

function validRuleset(overrides: Record<string, unknown> = {}): SaveableBadWordRuleset {
    return saveBadWordRulesetInputSchema.parse({ name: "No swears", ...overrides });
}

beforeEach(() => {
    vi.mocked(redis.del).mockClear();
    vi.mocked(redis.publish).mockClear();
});

describe("bad word rulesets against a real database", () => {
    it("returns an empty array for a guild with no rulesets", async () => {
        expect(await getBadWordRulesets(GUILD_A)).toEqual([]);
    });

    it("maps a row with its JSONB columns and timestamps", async () => {
        await saveBadWordRuleset(
            GUILD_A,
            validRuleset({
                enabled: false,
                patterns: [{ value: "darn", strategy: "EXACT" }],
                actions: ["WARN", "DELETE"],
                timeoutDurationSeconds: 300,
                scope: { mode: "ENFORCED", roles: ["111"], channels: ["222"] },
            })
        );

        const [row] = await getBadWordRulesets(GUILD_A);

        expect(typeof row.id).toBe("string");
        expect(row.guildId).toBe(GUILD_A);
        expect(row.name).toBe("No swears");
        expect(row.enabled).toBe(false);
        expect(row.patterns).toEqual([{ value: "darn", strategy: "EXACT" }]);
        expect(row.actions).toEqual(["WARN", "DELETE"]);
        expect(row.timeoutDurationSeconds).toBe(300);
        expect(row.scope).toEqual({ mode: "ENFORCED", roles: ["111"], channels: ["222"] });
        expect(row.createdAt).toBeInstanceOf(Date);
        expect(row.updatedAt).toBeInstanceOf(Date);
    });

    it("defaults missing JSONB columns to empty collections", async () => {
        await saveBadWordRuleset(GUILD_A, validRuleset());

        const [row] = await getBadWordRulesets(GUILD_A);

        expect(row.patterns).toEqual([]);
        expect(row.actions).toEqual([]);
        expect(row.timeoutDurationSeconds).toBeNull();
        expect(row.scope).toEqual({ mode: "EXEMPT", roles: [], channels: [] });
    });

    it("scopes rulesets to the guild in creation order", async () => {
        await saveBadWordRuleset(GUILD_A, validRuleset({ name: "First" }));
        await saveBadWordRuleset(GUILD_A, validRuleset({ name: "Second" }));
        await saveBadWordRuleset(GUILD_B, validRuleset({ name: "Theirs" }));

        const rows = await getBadWordRulesets(GUILD_A);

        expect(rows.map((r) => r.name)).toEqual(["First", "Second"]);
    });

    it("generates a uuid when no id is given", async () => {
        const saved = await saveBadWordRuleset(GUILD_A, validRuleset());

        expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(saved.guildId).toBe(GUILD_A);
    });

    it("rejects a blank id at the uuid cast", async () => {
        // No blank-to-null normalization here, so "" reaches COALESCE as-is.
        await expect(saveBadWordRuleset(GUILD_A, validRuleset({ id: "" }))).rejects.toThrow(
            /invalid input syntax for type uuid/
        );
    });

    it("updates in place when the id already exists", async () => {
        const first = await saveBadWordRuleset(GUILD_A, validRuleset({ name: "Before" }));
        const second = await saveBadWordRuleset(
            GUILD_A,
            validRuleset({ id: first.id, name: "After", enabled: false })
        );

        expect(second.id).toBe(first.id);
        expect(second.name).toBe("After");
        expect(await getBadWordRulesets(GUILD_A)).toHaveLength(1);
    });

    it("bumps updated_at on conflict but leaves created_at alone", async () => {
        const first = await saveBadWordRuleset(GUILD_A, validRuleset());
        await db.query(
            "UPDATE bad_word_rulesets SET created_at = '2020-01-01T00:00:00Z', updated_at = '2020-01-01T00:00:00Z' WHERE id = $1::uuid",
            [first.id]
        );

        await saveBadWordRuleset(GUILD_A, validRuleset({ id: first.id, name: "Renamed" }));

        const [reloaded] = await getBadWordRulesets(GUILD_A);
        expect(reloaded.createdAt?.toISOString()).toBe("2020-01-01T00:00:00.000Z");
        expect(reloaded.updatedAt?.toISOString()).not.toBe("2020-01-01T00:00:00.000Z");
    });

    it("leaves guild_id alone on a cross-guild upsert", async () => {
        // The SET list has no guild_id, so replaying an id elsewhere only renames the row.
        const first = await saveBadWordRuleset(GUILD_A, validRuleset({ name: "Before" }));

        await saveBadWordRuleset(GUILD_B, validRuleset({ id: first.id, name: "Hijacked" }));

        expect(await getBadWordRulesets(GUILD_B)).toHaveLength(0);
        const [kept] = await getBadWordRulesets(GUILD_A);
        expect(kept.id).toBe(first.id);
        expect(kept.name).toBe("Hijacked");
    });

    it("invalidates the guild bad-words cache on save", async () => {
        await saveBadWordRuleset(GUILD_A, validRuleset());

        expect(vi.mocked(redis.del)).toHaveBeenCalledWith(`config:guild:${GUILD_A}:bad_words`);
        expect(vi.mocked(redis.publish)).toHaveBeenCalledWith(
            "config_updates",
            `invalidate:${GUILD_A}:bad_words`
        );
    });

    it("deletes the guild's ruleset and invalidates both cache keys", async () => {
        const saved = await saveBadWordRuleset(GUILD_A, validRuleset());
        vi.mocked(redis.del).mockClear();
        vi.mocked(redis.publish).mockClear();

        await deleteBadWordRuleset(GUILD_A, saved.id);

        expect(await getBadWordRulesets(GUILD_A)).toHaveLength(0);
        expect(vi.mocked(redis.del)).toHaveBeenCalledWith(`config:guild:${GUILD_A}:bad_words`);
        expect(vi.mocked(redis.del)).toHaveBeenCalledWith(`config:guild:${GUILD_A}`);
        expect(vi.mocked(redis.publish)).toHaveBeenCalledWith(
            "config_updates",
            `invalidate:${GUILD_A}:bad_words`
        );
    });

    it("refuses to delete another guild's ruleset", async () => {
        const foreign = await saveBadWordRuleset(GUILD_B, validRuleset());

        await deleteBadWordRuleset(GUILD_A, foreign.id);

        expect(await getBadWordRulesets(GUILD_B)).toHaveLength(1);
    });
});
