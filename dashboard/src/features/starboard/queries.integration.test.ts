import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import {
    deleteStarboardConfig,
    getStarboardConfigs,
    upsertStarboardConfig,
} from "./queries";
import { starboardConfigInputSchema, type SaveableStarboardConfig } from "./types";
import { ZodError } from "zod";

const GUILD_A = "123456789012345678";
const GUILD_B = "987654321098765432";

function validInput(overrides: Record<string, unknown> = {}): SaveableStarboardConfig {
    return starboardConfigInputSchema.parse({ starboard_channel_id: "111111111111111111", ...overrides });
}

// ZodError.message is the issues array as JSON, so rebuild the exact issue.
function postgresIntervalError(field: string): ZodError {
    return new ZodError([
        {
            expected: "string",
            code: "invalid_type",
            path: [field],
            message: "Invalid input: expected string, received PostgresInterval",
        },
    ]);
}

describe("starboard configs against a real database", () => {
    describe("upsertStarboardConfig", () => {
        it("inserts a new config and lets the bigserial assign the id", async () => {
            const saved = await upsertStarboardConfig(GUILD_A, validInput());

            // BIGSERIAL comes back as a string, and starboardConfigSchema coerces it.
            expect(typeof saved.id).toBe("string");
            expect(Number(saved.id)).toBeGreaterThan(0);
        });

        it("updates in place when the id already exists", async () => {
            const first = await upsertStarboardConfig(GUILD_A, validInput({ reaction_threshold: 3 }));
            const second = await upsertStarboardConfig(
                GUILD_A,
                validInput({ id: first.id, reaction_threshold: 9 })
            );

            expect(second.id).toBe(first.id);
            expect((await getStarboardConfigs(GUILD_A))[0].reaction_threshold).toBe(9);
        });

        it("bumps updated_at on an update but leaves created_at alone", async () => {
            const first = await upsertStarboardConfig(GUILD_A, validInput());
            await db.query(
                "UPDATE starboards SET created_at = '2020-01-01T00:00:00Z', updated_at = '2020-01-01T00:00:00Z' WHERE id = $1::bigint",
                [first.id]
            );

            await upsertStarboardConfig(GUILD_A, validInput({ id: first.id }));

            const [reloaded] = await getStarboardConfigs(GUILD_A);
            expect(reloaded.created_at.toISOString()).toBe("2020-01-01T00:00:00.000Z");
            expect(reloaded.updated_at.toISOString()).not.toBe("2020-01-01T00:00:00.000Z");
        });

        it("round-trips the emojis text array", async () => {
            await upsertStarboardConfig(GUILD_A, validInput({ emojis: ["⭐", "🌟"] }));

            expect((await getStarboardConfigs(GUILD_A))[0].emojis).toEqual(["⭐", "🌟"]);
        });

        it("round-trips restricted_roles as strings", async () => {
            await upsertStarboardConfig(GUILD_A, validInput({ restricted_roles: ["222", "333"] }));

            const [reloaded] = await getStarboardConfigs(GUILD_A);
            // The column is BIGINT[], so a snowflake could not survive as a JS number.
            expect(reloaded.restricted_roles).toEqual(["222", "333"]);
        });

        it("round-trips the restriction type enums", async () => {
            await upsertStarboardConfig(
                GUILD_A,
                validInput({
                    role_restriction_type: "ALL_EXCEPT",
                    channel_restriction_type: "ONLY_THESE",
                })
            );

            const [reloaded] = await getStarboardConfigs(GUILD_A);
            expect(reloaded.role_restriction_type).toBe("ALL_EXCEPT");
            expect(reloaded.channel_restriction_type).toBe("ONLY_THESE");
        });

        it("stores the embed template as JSONB", async () => {
            await upsertStarboardConfig(
                GUILD_A,
                validInput({ embed_template: { title: "Starred", color: 16776960 } })
            );

            const { rows } = await db.query<{ embed_template: { title: string; color: number } }>(
                "SELECT embed_template FROM starboards WHERE guild_id = $1::bigint",
                [GUILD_A]
            );
            expect(rows[0].embed_template).toEqual({ title: "Starred", color: 16776960 });
        });

        it("stores the plaintext template and the deleted-message flag", async () => {
            await upsertStarboardConfig(
                GUILD_A,
                validInput({ plaintext_template: "star {message}", keep_deleted_messages: true })
            );

            const [reloaded] = await getStarboardConfigs(GUILD_A);
            expect(reloaded.plaintext_template).toBe("star {message}");
            expect(reloaded.keep_deleted_messages).toBe(true);
        });

        it("rejects a reaction threshold of zero, which the migration forbids", async () => {
            await expect(
                db.query(
                    "INSERT INTO starboards (guild_id, starboard_channel_id, reaction_threshold) VALUES ($1::bigint, 1::bigint, 0)",
                    [GUILD_A]
                )
            ).rejects.toThrow(/starboards_reaction_threshold_check/);
        });

        // pg parses an INTERVAL column into a PostgresInterval object, and
        // starboardConfigSchema declares these two fields as nullable strings, so the
        // RETURNING * row fails to parse and the save throws after it has been written.
        // The config is already persisted at that point, so the caller sees a failure
        // for a row that exists.
        it("throws when saving a min_message_age, because pg returns a PostgresInterval", async () => {
            await expect(
                upsertStarboardConfig(GUILD_A, validInput({ min_message_age: "1 hour" }))
            ).rejects.toThrow(/received PostgresInterval/);

            const { rows } = await db.query<{ count: number }>(
                "SELECT count(*)::int AS count FROM starboards WHERE guild_id = $1::bigint",
                [GUILD_A]
            );
            // The insert went through despite the throw.
            expect(rows[0].count).toBe(1);
        });

        it("throws when saving a max_message_age, for the same reason", async () => {
            await expect(
                upsertStarboardConfig(GUILD_A, validInput({ max_message_age: "90 days" }))
            ).rejects.toThrow(/received PostgresInterval/);
        });

        // The id branch builds its own values array, so the interval round trip
        // needs covering there too: storing null instead would parse cleanly and not throw.
        it("writes min_message_age on an update, which then fails to parse like on insert", async () => {
            const first = await upsertStarboardConfig(GUILD_A, validInput());

            let thrown: unknown;
            try {
                await upsertStarboardConfig(GUILD_A, validInput({ id: first.id, min_message_age: "1 hour" }));
            } catch (error) {
                thrown = error;
            }
            expect(thrown).toBeInstanceOf(ZodError);
            if (thrown instanceof ZodError) {
                expect(thrown.message).toBe(postgresIntervalError("min_message_age").message);
            }

            const { rows } = await db.query<{ is_null: boolean }>(
                "SELECT min_message_age IS NULL AS is_null FROM starboards WHERE id = $1::bigint",
                [first.id]
            );
            expect(rows[0].is_null).toBe(false);
        });

        it("writes max_message_age on an update, which then fails to parse like on insert", async () => {
            const first = await upsertStarboardConfig(GUILD_A, validInput());

            let thrown: unknown;
            try {
                await upsertStarboardConfig(GUILD_A, validInput({ id: first.id, max_message_age: "90 days" }));
            } catch (error) {
                thrown = error;
            }
            expect(thrown).toBeInstanceOf(ZodError);
            if (thrown instanceof ZodError) {
                expect(thrown.message).toBe(postgresIntervalError("max_message_age").message);
            }

            const { rows } = await db.query<{ is_null: boolean }>(
                "SELECT max_message_age IS NULL AS is_null FROM starboards WHERE id = $1::bigint",
                [first.id]
            );
            expect(rows[0].is_null).toBe(false);
        });

        it("saves and reads back cleanly when both ages are null", async () => {
            const saved = await upsertStarboardConfig(GUILD_A, validInput());

            expect(saved.min_message_age).toBeNull();
            expect(saved.max_message_age).toBeNull();
        });

        // ON CONFLICT (id) DO UPDATE does not reassign guild_id, so passing another
        // guild's id writes that guild's values onto the existing row instead of
        // failing. The row keeps its original owner.
        it("lets one guild overwrite another guild's config by passing its id", async () => {
            const foreign = await upsertStarboardConfig(GUILD_B, validInput({ reaction_threshold: 3 }));

            await upsertStarboardConfig(
                GUILD_A,
                validInput({ id: foreign.id, reaction_threshold: 99 })
            );

            const [b] = await getStarboardConfigs(GUILD_B);
            expect(b.reaction_threshold).toBe(99);
            expect(b.guild_id).toBe(GUILD_B);
        });
    });

    describe("getStarboardConfigs", () => {
        it("returns only the requested guild's configs", async () => {
            await upsertStarboardConfig(GUILD_A, validInput());
            await upsertStarboardConfig(GUILD_B, validInput());

            expect(await getStarboardConfigs(GUILD_A)).toHaveLength(1);
            expect((await getStarboardConfigs(GUILD_A))[0].guild_id).toBe(GUILD_A);
        });

        it("returns every config for a guild with several starboards", async () => {
            await upsertStarboardConfig(GUILD_A, validInput({ starboard_channel_id: "111111111111111111" }));
            await upsertStarboardConfig(GUILD_A, validInput({ starboard_channel_id: "222222222222222222" }));

            expect(await getStarboardConfigs(GUILD_A)).toHaveLength(2);
        });

        it("returns an empty array for a guild with no configs", async () => {
            expect(await getStarboardConfigs(GUILD_A)).toEqual([]);
        });

        it("returns the timestamps as Dates", async () => {
            await upsertStarboardConfig(GUILD_A, validInput());

            const [reloaded] = await getStarboardConfigs(GUILD_A);
            expect(reloaded.created_at).toBeInstanceOf(Date);
            expect(reloaded.updated_at).toBeInstanceOf(Date);
        });

        it("reads a config inserted straight into the table", async () => {
            // The bot writes starboards too, so the dashboard has to read what it finds.
            await db.query(
                `INSERT INTO starboards (guild_id, starboard_channel_id, reaction_threshold, emojis)
                 VALUES ($1::bigint, $2::bigint, 5, ARRAY['🌟']::text[])`,
                [GUILD_A, "444444444444444444"]
            );

            const [reloaded] = await getStarboardConfigs(GUILD_A);
            expect(reloaded.reaction_threshold).toBe(5);
            expect(reloaded.emojis).toEqual(["🌟"]);
            expect(reloaded.min_message_age).toBeNull();
        });
    });

    describe("deleteStarboardConfig", () => {
        it("deletes the config and reports success", async () => {
            const saved = await upsertStarboardConfig(GUILD_A, validInput());

            expect(await deleteStarboardConfig(saved.id, GUILD_A)).toBe(true);
            expect(await getStarboardConfigs(GUILD_A)).toEqual([]);
        });

        it("refuses to delete a config belonging to another guild", async () => {
            const foreign = await upsertStarboardConfig(GUILD_B, validInput());

            expect(await deleteStarboardConfig(foreign.id, GUILD_A)).toBe(false);
            expect(await getStarboardConfigs(GUILD_B)).toHaveLength(1);
        });

        it("cascades onto the starred messages pointing at it", async () => {
            const saved = await upsertStarboardConfig(GUILD_A, validInput());
            await db.query(
                `INSERT INTO starred_messages (original_message_id, starboard_id, guild_id, channel_id, author_id)
                 VALUES (555::bigint, $1::bigint, $2::bigint, 666::bigint, 777::bigint)`,
                [saved.id, GUILD_A]
            );

            await deleteStarboardConfig(saved.id, GUILD_A);

            const { rows } = await db.query<{ count: number }>(
                "SELECT count(*)::int AS count FROM starred_messages WHERE starboard_id = $1::bigint",
                [saved.id]
            );
            expect(rows[0].count).toBe(0);
        });
    });
});