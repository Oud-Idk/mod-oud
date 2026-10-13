import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
    deleteReactionMessage,
    getReactionMessageById,
    getReactionMessages,
    saveReactionMessage,
} from "./queries";
import type { SaveReactionMessageInput } from "./types";

const GUILD_A = "123456789012345678";
const GUILD_B = "987654321098765432";
const CHANNEL_A = "111111111111111111";
const ROLE_1 = "333333333333333333";
const ROLE_2 = "444444444444444444";
const ROLE_3 = "555555555555555555";

function reactionInput(overrides: Record<string, unknown> = {}): SaveReactionMessageInput {
    return {
        name: "Verify",
        guild_id: GUILD_A,
        channel_id: CHANNEL_A,
        message: { format: "TEXT", content: "Pick a role", embed: {} },
        mode: "REACTION",
        reactions: [{ emoji: "🎉", role_id: ROLE_1 }],
        buttons: [],
        ...overrides,
    };
}

function buttonInput(overrides: Record<string, unknown> = {}): SaveReactionMessageInput {
    return {
        name: "Roles",
        guild_id: GUILD_A,
        channel_id: CHANNEL_A,
        message: { format: "TEXT", content: "Pick a role", embed: {} },
        mode: "BUTTON",
        reactions: [],
        buttons: [
            { role_id: ROLE_1, custom_id: "btn_1", label: "Role 1", style: "SUCCESS", emoji: "🎉" },
        ],
        ...overrides,
    };
}

async function childCounts(id: number): Promise<{ reactions: number; buttons: number }> {
    const reactions = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM reaction_roles WHERE reaction_message_id = $1",
        [id]
    );
    const buttons = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM button_roles WHERE reaction_message_id = $1",
        [id]
    );
    return { reactions: reactions.rows[0].count, buttons: buttons.rows[0].count };
}

describe("reaction messages against a real database", () => {
    it("saves a REACTION message and reads back role ids as strings", async () => {
        const saved = await saveReactionMessage(
            reactionInput({
                reactions: [
                    { emoji: "🎉", role_id: ROLE_1 },
                    { emoji: "👍", role_id: ROLE_2 },
                ],
            })
        );

        expect(typeof saved.id).toBe("number");

        const reloaded = await getReactionMessageById(saved.id);
        expect(reloaded?.reactions).toEqual([
            { emoji: "🎉", role_id: ROLE_1 },
            { emoji: "👍", role_id: ROLE_2 },
        ]);
        expect(reloaded?.buttons).toEqual([]);
        expect(reloaded?.guild_id).toBe(GUILD_A);
        expect(reloaded?.channel_id).toBe(CHANNEL_A);
    });

    it("saves a BUTTON message and reads back the style enum", async () => {
        const saved = await saveReactionMessage(buttonInput());

        const reloaded = await getReactionMessageById(saved.id);
        expect(reloaded?.buttons).toEqual([
            { role_id: ROLE_1, custom_id: "btn_1", label: "Role 1", style: "SUCCESS", emoji: "🎉" },
        ]);
        expect(reloaded?.reactions).toEqual([]);
    });

    it("scopes the list to the guild", async () => {
        await saveReactionMessage(reactionInput());
        await saveReactionMessage(reactionInput({ guild_id: GUILD_B, channel_id: CHANNEL_A }));

        const rows = await getReactionMessages(GUILD_A);

        expect(rows).toHaveLength(1);
        expect(rows[0].guild_id).toBe(GUILD_A);
    });

    it("returns an empty list and null for unknown ids", async () => {
        expect(await getReactionMessages(GUILD_A)).toEqual([]);
        expect(await getReactionMessageById(999999)).toBeNull();
    });

    // A row written by the bot has no children yet, so the COALESCE over an
    // empty JSON_AGG is what keeps reactions and buttons as [] instead of null.
    it("returns empty arrays for a row inserted without children", async () => {
        const { rows } = await db.query<{ id: string }>(
            `INSERT INTO reaction_messages (name, channel_id, guild_id, mode, message)
             VALUES ('Direct', $1::bigint, $2::bigint, 'REACTION',
                     '{"format":"TEXT","content":"Hi","embed":{}}'::jsonb)
             RETURNING id`
            ,
            [CHANNEL_A, GUILD_A]
        );

        const reloaded = await getReactionMessageById(Number(rows[0].id));

        expect(reloaded?.reactions).toEqual([]);
        expect(reloaded?.buttons).toEqual([]);
    });

    it("updates in place when the id already exists", async () => {
        const first = await saveReactionMessage(reactionInput({ name: "Before" }));
        const second = await saveReactionMessage(
            reactionInput({ id: first.id, name: "After", channel_id: CHANNEL_A })
        );

        expect(second.id).toBe(first.id);
        expect((await getReactionMessageById(first.id))?.name).toBe("After");
    });

    it("replaces the child set on re-save instead of accumulating", async () => {
        const first = await saveReactionMessage(
            reactionInput({
                reactions: [
                    { emoji: "🎉", role_id: ROLE_1 },
                    { emoji: "👍", role_id: ROLE_2 },
                ],
            })
        );

        await saveReactionMessage(
            reactionInput({ id: first.id, reactions: [{ emoji: "🎉", role_id: ROLE_3 }] })
        );

        expect(await getReactionMessageById(first.id).then((r) => r?.reactions)).toEqual([
            { emoji: "🎉", role_id: ROLE_3 },
        ]);
        expect((await childCounts(first.id)).reactions).toBe(1);
    });

    it("clears reactions when switching to BUTTON mode", async () => {
        const first = await saveReactionMessage(reactionInput());
        await saveReactionMessage(buttonInput({ id: first.id }));

        const reloaded = await getReactionMessageById(first.id);
        expect(reloaded?.mode).toBe("BUTTON");
        expect(reloaded?.reactions).toEqual([]);
        expect(reloaded?.buttons).toHaveLength(1);
        expect(await childCounts(first.id)).toEqual({ reactions: 0, buttons: 1 });
    });

    // Two rows with the same emoji in one UNNEST hit the unique key twice in a
    // single statement, which Postgres rejects instead of upserting.
    it("rejects duplicate emoji within one save", async () => {
        await expect(
            saveReactionMessage(
                reactionInput({
                    reactions: [
                        { emoji: "🎉", role_id: ROLE_1 },
                        { emoji: "🎉", role_id: ROLE_2 },
                    ],
                })
            )
        ).rejects.toThrow(/cannot affect row a second time/);

        expect(await getReactionMessages(GUILD_A)).toEqual([]);
    });

    it("rejects duplicate custom_id within one save", async () => {
        await expect(
            saveReactionMessage(
                buttonInput({
                    buttons: [
                        { role_id: ROLE_1, custom_id: "btn_1", label: "First", style: "PRIMARY" },
                        { role_id: ROLE_2, custom_id: "btn_1", label: "Second", style: "DANGER" },
                    ],
                })
            )
        ).rejects.toThrow(/cannot affect row a second time/);

        expect(await getReactionMessages(GUILD_A)).toEqual([]);
    });

    it("upserts a reaction role on (reaction_message_id, emoji)", async () => {
        const saved = await saveReactionMessage(reactionInput());

        await db.query(
            `INSERT INTO reaction_roles (reaction_message_id, emoji, role_id)
             SELECT $1, u.emoji, u.role_id::bigint
             FROM UNNEST($2::text[], $3::text[]) AS u(emoji, role_id)
             ON CONFLICT (reaction_message_id, emoji) DO UPDATE SET role_id = EXCLUDED.role_id`,
            [saved.id, ["🎉"], [ROLE_2]]
        );

        expect((await getReactionMessageById(saved.id))?.reactions).toEqual([
            { emoji: "🎉", role_id: ROLE_2 },
        ]);
    });

    it("upserts a button role on (reaction_message_id, custom_id)", async () => {
        const saved = await saveReactionMessage(buttonInput());

        await db.query(
            `INSERT INTO button_roles (reaction_message_id, role_id, custom_id, label, style, emoji)
             SELECT $1, u.role_id::bigint, u.custom_id, u.label, u.style::button_style, u.emoji
             FROM UNNEST($2::text[], $3::text[], $4::text[], $5::text[], $6::text[])
                      AS u(role_id, custom_id, label, style, emoji)
             ON CONFLICT (reaction_message_id, custom_id)
                 DO UPDATE SET role_id = EXCLUDED.role_id, label = EXCLUDED.label`,
            [saved.id, [ROLE_2], ["btn_1"], ["Updated"], ["DANGER"], [null]]
        );

        expect((await getReactionMessageById(saved.id))?.buttons[0]).toMatchObject({
            role_id: ROLE_2,
            custom_id: "btn_1",
            label: "Updated",
        });
    });

    // u.role_id::bigint rejects the value, and ROLLBACK removes the parent row
    // inserted earlier in the same transaction.
    it("rolls back the parent insert when a child role id is not a bigint", async () => {
        await expect(
            saveReactionMessage(reactionInput({ reactions: [{ emoji: "🎉", role_id: "abc" }] }))
        ).rejects.toThrow();

        expect(await getReactionMessages(GUILD_A)).toEqual([]);
    });

    it("rejects a message_id already used by another row", async () => {
        await saveReactionMessage(reactionInput({ message_id: "666666666666666666" }));

        await expect(
            saveReactionMessage(reactionInput({ message_id: "666666666666666666" }))
        ).rejects.toThrow(/duplicate key/);
    });

    it("throws when updating an id that does not exist", async () => {
        await expect(saveReactionMessage(reactionInput({ id: 999999 }))).rejects.toThrow(
            /Reaction message with ID 999999 not found/
        );
    });

    it("deletes the message and cascades onto its children", async () => {
        const saved = await saveReactionMessage(reactionInput());

        expect(await deleteReactionMessage(saved.id)).toBe(true);
        expect(await getReactionMessageById(saved.id)).toBeNull();
        expect(await childCounts(saved.id)).toEqual({ reactions: 0, buttons: 0 });
    });

    it("returns false when deleting an id that does not exist", async () => {
        expect(await deleteReactionMessage(999999)).toBe(false);
    });
});
