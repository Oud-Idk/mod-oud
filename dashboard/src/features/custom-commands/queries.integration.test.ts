import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
    deleteCustomCommand,
    getCustomCommands,
    saveCustomCommand,
} from "./queries";

const GUILD_A = "123456789012345678";
const GUILD_B = "987654321098765432";

type SaveCommandInput = Parameters<typeof saveCustomCommand>[0];

function validCommand(overrides: Partial<SaveCommandInput> = {}): SaveCommandInput {
    return {
        guild_id: GUILD_A,
        name: "rules",
        description: "Server rules",
        enabled: true,
        delete_trigger: false,
        trigger_anywhere: false,
        cooldown_type: "NONE",
        cooldown_seconds: 0,
        allowed_roles: [],
        ignored_roles: [],
        allowed_channels: [],
        ignored_channels: [],
        actions: [{ type: "add_role", data: { role_id: "999" } }],
        ...overrides,
    };
}

describe("custom commands against a real database", () => {
    it("returns an empty array for a guild with no commands", async () => {
        expect(await getCustomCommands(GUILD_A)).toEqual([]);
    });

    it("maps a row with its roles, channels and actions", async () => {
        await saveCustomCommand(
            validCommand({
                name: "ping",
                trigger_anywhere: true,
                cooldown_type: "USER",
                cooldown_seconds: 30,
                allowed_roles: ["111", "222"],
                ignored_channels: ["333"],
                actions: [{ type: "add_role", data: { role_id: "444" } }],
            })
        );

        const [row] = await getCustomCommands(GUILD_A);

        // BIGSERIAL comes back as a string, and the schema coerces it.
        expect(typeof row.id).toBe("number");
        expect(row.guild_id).toBe(GUILD_A);
        expect(row.name).toBe("ping");
        expect(row.description).toBe("Server rules");
        expect(row.enabled).toBe(true);
        expect(row.delete_trigger).toBe(false);
        expect(row.trigger_anywhere).toBe(true);
        expect(row.cooldown_type).toBe("USER");
        expect(row.cooldown_seconds).toBe(30);
        expect(row.allowed_roles).toEqual(["111", "222"]);
        expect(row.ignored_roles).toEqual([]);
        expect(row.allowed_channels).toEqual([]);
        expect(row.ignored_channels).toEqual(["333"]);
        expect(row.actions).toEqual([{ type: "add_role", data: { role_id: "444" } }]);
    });

    it("stores a missing description as null", async () => {
        const saved = await saveCustomCommand(validCommand({ description: undefined }));

        const { rows } = await db.query<{ description: string | null }>(
            "SELECT description FROM custom_commands WHERE id = $1",
            [saved.id]
        );
        expect(rows[0].description).toBeNull();
        // RETURNING * has no COALESCE, so the save path reports null
        // while the listing path coalesces it to "".
        expect(saved.description).toBeNull();
        expect((await getCustomCommands(GUILD_A))[0].description).toBe("");
    });

    it("scopes commands to the guild", async () => {
        await saveCustomCommand(validCommand({ name: "own" }));
        await saveCustomCommand({ ...validCommand({ name: "theirs" }), guild_id: GUILD_B });

        expect(await getCustomCommands(GUILD_A)).toHaveLength(1);
        expect(await getCustomCommands(GUILD_B)).toHaveLength(1);
    });

    it("orders by id descending", async () => {
        await saveCustomCommand(validCommand({ name: "first" }));
        await saveCustomCommand(validCommand({ name: "second" }));

        const rows = await getCustomCommands(GUILD_A);

        expect(rows.map((r) => r.name)).toEqual(["second", "first"]);
        expect(rows[0].id).toBeGreaterThan(rows[1].id);
    });

    it("assigns a bigserial id on insert", async () => {
        const saved = await saveCustomCommand(validCommand());

        expect(typeof saved.id).toBe("number");
        expect(saved.id).toBeGreaterThan(0);
    });

    it("updates in place when the id is present", async () => {
        const first = await saveCustomCommand(validCommand({ name: "before" }));
        const second = await saveCustomCommand(
            validCommand({ id: first.id, name: "after", cooldown_seconds: 60 })
        );

        expect(second.id).toBe(first.id);
        expect(second.name).toBe("after");
        expect(second.cooldown_seconds).toBe(60);
        expect(await getCustomCommands(GUILD_A)).toHaveLength(1);
    });

    it("refuses to update another guild's command", async () => {
        const foreign = await saveCustomCommand({
            ...validCommand({ name: "theirs" }),
            guild_id: GUILD_B,
        });

        // The UPDATE matches no row, so RETURNING * yields nothing to parse.
        await expect(
            saveCustomCommand(validCommand({ id: foreign.id, name: "hijacked" }))
        ).rejects.toThrow();
        expect((await getCustomCommands(GUILD_B))[0].name).toBe("theirs");
    });

    it("rejects a duplicate name within the guild", async () => {
        await saveCustomCommand(validCommand({ name: "rules" }));

        await expect(saveCustomCommand(validCommand({ name: "rules" }))).rejects.toThrow(
            /unique_command_per_guild/
        );
    });

    it("allows the same name in a different guild", async () => {
        await saveCustomCommand(validCommand({ name: "rules" }));
        await saveCustomCommand({ ...validCommand({ name: "rules" }), guild_id: GUILD_B });

        expect(await getCustomCommands(GUILD_A)).toHaveLength(1);
        expect(await getCustomCommands(GUILD_B)).toHaveLength(1);
    });

    it("deletes the guild's command and reports success", async () => {
        const saved = await saveCustomCommand(validCommand());

        expect(await deleteCustomCommand(saved.id, GUILD_A)).toBe(true);
        expect(await getCustomCommands(GUILD_A)).toHaveLength(0);
    });

    it("refuses to delete another guild's command", async () => {
        const foreign = await saveCustomCommand({
            ...validCommand({ name: "theirs" }),
            guild_id: GUILD_B,
        });

        expect(await deleteCustomCommand(foreign.id, GUILD_A)).toBe(false);
        expect(await getCustomCommands(GUILD_B)).toHaveLength(1);
    });

    it("reports false for a missing command", async () => {
        expect(await deleteCustomCommand(999999, GUILD_A)).toBe(false);
    });
});
