import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import type { EconomyWorkMessage } from "./types";
import {
    deleteEconomyWorkMessage,
    getEconomyWorkMessages,
    saveEconomyWorkMessage,
    syncEconomyWorkMessages,
} from "./queries";

const GUILD_A = "123456789012345678";
const GUILD_B = "987654321098765432";

// The schema marks id optional, but a saved message always comes back with one.
type SeededMessage = EconomyWorkMessage & { id: string };

async function seedMessage(guildId: string, content: string, id?: string): Promise<SeededMessage> {
    const saved = await saveEconomyWorkMessage(guildId, id !== undefined ? { id, content } : { content });
    if (saved.id === undefined) throw new Error("saveEconomyWorkMessage returned no id");
    return { ...saved, id: saved.id };
}

describe("economy work messages against a real database", () => {
    describe("saveEconomyWorkMessage", () => {
        it("stores the guild snowflake as a bigint and reads it back", async () => {
            const saved = await seedMessage(GUILD_A, "Work, {user}!");

            expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);

            const { rows } = await db.query<{ guild_id: string; content: string }>(
                "SELECT guild_id::text, content FROM economy_work_messages WHERE id = $1::uuid",
                [saved.id]
            );
            expect(rows[0].guild_id).toBe(GUILD_A);
            expect(rows[0].content).toBe("Work, {user}!");
        });

        it("updates in place when the id already exists", async () => {
            const first = await seedMessage(GUILD_A, "first");
            const second = await saveEconomyWorkMessage(GUILD_A, { id: first.id, content: "second" });

            expect(second.id).toBe(first.id);

            const messages = await getEconomyWorkMessages(GUILD_A);
            expect(messages).toHaveLength(1);
            expect(messages[0].content).toBe("second");
        });

        it("rejects whitespace-only content, which the migration forbids", async () => {
            // The Zod schema is min(1) and passes "   ", so only the CHECK constraint catches it.
            await expect(seedMessage(GUILD_A, "   ")).rejects.toThrow(/chk_economy_work_messages_content_not_blank/);
        });

        it("rejects content past the 1000 character limit", async () => {
            await expect(seedMessage(GUILD_A, "a".repeat(1001))).rejects.toThrow(
                /chk_economy_work_messages_content_len/
            );
        });
    });

    describe("getEconomyWorkMessages", () => {
        it("returns only the requested guild's messages, oldest first", async () => {
            const second = await seedMessage(GUILD_A, "second");
            const first = await seedMessage(GUILD_A, "first");
            await seedMessage(GUILD_B, "other guild");

            // CURRENT_TIMESTAMP is the transaction start time, so rows written together tie.
            // Stagger them explicitly to make the ordering assertion meaningful.
            await db.query("UPDATE economy_work_messages SET created_at = $2::timestamptz WHERE id = $1::uuid", [
                first.id,
                "2026-01-01T00:00:00Z",
            ]);
            await db.query("UPDATE economy_work_messages SET created_at = $2::timestamptz WHERE id = $1::uuid", [
                second.id,
                "2026-01-02T00:00:00Z",
            ]);

            const messages = await getEconomyWorkMessages(GUILD_A);

            expect(messages.map((m) => m.content)).toEqual(["first", "second"]);
        });
    });

    describe("deleteEconomyWorkMessage", () => {
        it("refuses to delete a message belonging to another guild", async () => {
            const foreign = await seedMessage(GUILD_B, "not yours");

            const deleted = await deleteEconomyWorkMessage(GUILD_A, foreign.id);

            expect(deleted).toBe(false);
            expect(await getEconomyWorkMessages(GUILD_B)).toHaveLength(1);
        });
    });

    describe("syncEconomyWorkMessages", () => {
        it("replaces the guild's set, adding, updating and removing in one transaction", async () => {
            const keep = await seedMessage(GUILD_A, "keep me");
            await seedMessage(GUILD_A, "drop me");
            await seedMessage(GUILD_B, "untouched");

            const result = await syncEconomyWorkMessages(GUILD_A, [
                { id: keep.id, content: "keep me, edited" },
                { content: "brand new" },
            ]);

            expect(result.map((m) => m.content).sort()).toEqual(["brand new", "keep me, edited"]);
            expect(await getEconomyWorkMessages(GUILD_A)).toHaveLength(2);
            expect(await getEconomyWorkMessages(GUILD_B)).toHaveLength(1);
        });

        it("clears the guild's messages when given an empty list", async () => {
            await seedMessage(GUILD_A, "one");
            await seedMessage(GUILD_A, "two");
            await seedMessage(GUILD_B, "untouched");

            expect(await syncEconomyWorkMessages(GUILD_A, [])).toEqual([]);
            expect(await getEconomyWorkMessages(GUILD_A)).toHaveLength(0);
            expect(await getEconomyWorkMessages(GUILD_B)).toHaveLength(1);
        });

        it("rolls the whole sync back when one message violates a constraint", async () => {
            const kept = await seedMessage(GUILD_A, "kept");
            const doomed = await seedMessage(GUILD_A, "doomed");

            // The delete runs before the insert, so a throwing insert proves ROLLBACK works.
            await expect(
                syncEconomyWorkMessages(GUILD_A, [
                    { id: kept.id, content: "   " },
                    { id: doomed.id, content: "replacement" },
                ])
            ).rejects.toThrow(/chk_economy_work_messages_content_not_blank/);

            const survivors = await getEconomyWorkMessages(GUILD_A);
            expect(survivors.map((m) => m.content)).toEqual(["kept", "doomed"]);
        });
    });
});