import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { deleteGiveaway, getGiveaways, saveGiveaway } from "./queries";
import { saveGiveawayInputSchema, type SaveGiveawayData } from "./types";

const GUILD_A = "123456789012345678";
const GUILD_B = "987654321098765432";
const HOST = "111111111111111111";
const CHANNEL_A = "222222222222222222";
const END_TIME = "2026-12-31T23:59:59.000Z";

function validInput(overrides: Record<string, unknown> = {}): SaveGiveawayData {
    return saveGiveawayInputSchema.parse({
        guild_id: GUILD_A,
        host_id: HOST,
        channel_id: CHANNEL_A,
        prize: "Nitro",
        winner_count: 2,
        end_time: END_TIME,
        ...overrides,
    });
}

describe("giveaways against a real database", () => {
    it("returns an empty array for a guild with no giveaways", async () => {
        expect(await getGiveaways(GUILD_A)).toEqual([]);
    });

    it("maps a row with its timestamps and message layout", async () => {
        await saveGiveaway(
            validInput({
                message: { format: "TEXT", content: "custom", embed: {} },
            })
        );

        const [row] = await getGiveaways(GUILD_A);

        // BIGSERIAL comes back as a string, and the schema coerces it.
        expect(typeof row.id).toBe("number");
        expect(row.guild_id).toBe(GUILD_A);
        expect(row.host_id).toBe(HOST);
        expect(row.channel_id).toBe(CHANNEL_A);
        expect(row.message_id).toBeNull();
        expect(row.prize).toBe("Nitro");
        expect(row.winner_count).toBe(2);
        expect(row.end_time).toEqual(new Date(END_TIME));
        expect(row.end_time).toBeInstanceOf(Date);
        expect(row.is_finished).toBe(false);
        expect(row.message).toMatchObject({ format: "TEXT", content: "custom" });
    });

    it("falls back to the default message for legacy rows", async () => {
        await db.query(
            `INSERT INTO giveaways (guild_id, host_id, channel_id, prize, winner_count, end_time, message_layout)
             VALUES ($1::bigint, $2::bigint, $3::bigint, 'Old', 1, $4::timestamptz, '{"enabled": true, "format": "TEXT", "content": "", "embed": {}}'::jsonb)`,
            [GUILD_A, HOST, CHANNEL_A, END_TIME]
        );

        const [row] = await getGiveaways(GUILD_A);

        expect(row.message.content).toContain("GIVEAWAY");
    });

    it("scopes giveaways to the guild in newest first order", async () => {
        await saveGiveaway(validInput({ prize: "First" }));
        await saveGiveaway(validInput({ prize: "Second" }));
        await saveGiveaway({ ...validInput({ prize: "Theirs" }), guild_id: GUILD_B });

        const rows = await getGiveaways(GUILD_A);

        expect(rows.map((r) => r.prize)).toEqual(["Second", "First"]);
        expect(rows[0].id).toBeGreaterThan(rows[1].id);
    });

    it("assigns a bigserial id on insert", async () => {
        const saved = await saveGiveaway(validInput());

        expect(typeof saved.id).toBe("number");
        expect(saved.id).toBeGreaterThan(0);
        expect(saved.message_id).toBeNull();
        expect(saved.is_finished).toBe(false);
    });

    it("defaults winner_count to one", async () => {
        const saved = await saveGiveaway(validInput({ winner_count: undefined }));

        expect(saved.winner_count).toBe(1);
        expect((await getGiveaways(GUILD_A))[0].winner_count).toBe(1);
    });

    it("updates in place when the id is present", async () => {
        const first = await saveGiveaway(validInput({ prize: "Before" }));
        const second = await saveGiveaway(
            validInput({ id: first.id, prize: "After", winner_count: 5 })
        );

        expect(second.id).toBe(first.id);
        expect(second.prize).toBe("After");
        expect(second.winner_count).toBe(5);
        expect(await getGiveaways(GUILD_A)).toHaveLength(1);
    });

    it("refuses to update another guild's giveaway", async () => {
        const foreign = await saveGiveaway({
            ...validInput({ prize: "Theirs" }),
            guild_id: GUILD_B,
        });

        // The UPDATE matches no row, so RETURNING * yields nothing to parse.
        await expect(
            saveGiveaway(validInput({ id: foreign.id, prize: "Hijacked" }))
        ).rejects.toThrow();
        expect((await getGiveaways(GUILD_B))[0].prize).toBe("Theirs");
    });

    it("deletes the guild's giveaway and reports success", async () => {
        const saved = await saveGiveaway(validInput());

        expect(await deleteGiveaway(saved.id, GUILD_A)).toBe(true);
        expect(await getGiveaways(GUILD_A)).toHaveLength(0);
    });

    it("refuses to delete another guild's giveaway", async () => {
        const foreign = await saveGiveaway({
            ...validInput({ prize: "Theirs" }),
            guild_id: GUILD_B,
        });

        expect(await deleteGiveaway(foreign.id, GUILD_A)).toBe(false);
        expect(await getGiveaways(GUILD_B)).toHaveLength(1);
    });

    it("reports false for a missing giveaway", async () => {
        expect(await deleteGiveaway(999999, GUILD_A)).toBe(false);
    });
});
