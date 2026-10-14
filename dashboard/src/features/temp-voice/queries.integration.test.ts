import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { backendFetch } from "@/lib/backend";
import {
    deleteTempVoiceHub,
    getTempVoiceHubs,
    saveTempVoiceHub,
} from "./queries";
import type { SaveTempVoiceHubInput } from "./types";

const GUILD_A = "123456789012345678";
const GUILD_B = "987654321098765432";
const CHANNEL_1 = "111111111111111111";
const CHANNEL_2 = "222222222222222222";
const CATEGORY_1 = "333333333333333333";
const CATEGORY_2 = "444444444444444444";
const INTERFACE_1 = "555555555555555555";

vi.mock("@/lib/backend", () => ({
    backendFetch: vi.fn(),
}));

function validInput(overrides: Partial<SaveTempVoiceHubInput> = {}): SaveTempVoiceHubInput {
    return {
        guild_id: GUILD_A,
        name: "Gaming",
        hub_channel_id: CHANNEL_1,
        category_id: CATEGORY_1,
        default_channel_name: "{user.display_name}'s Lounge",
        ...overrides,
    };
}

beforeEach(() => {
    vi.mocked(backendFetch).mockReset();
});

describe("temp voice hubs against a real database", () => {
    it("returns an empty array for a guild with no hubs", async () => {
        expect(await getTempVoiceHubs(GUILD_A)).toEqual([]);
    });

    it("round-trips every column through RETURNING *", async () => {
        const saved = await saveTempVoiceHub(
            GUILD_A,
            validInput({ user_limit: 0, interface_channel_id: INTERFACE_1 })
        );

        expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(saved.guild_id).toBe(GUILD_A);
        expect(saved.name).toBe("Gaming");
        expect(saved.hub_channel_id).toBe(CHANNEL_1);
        expect(saved.category_id).toBe(CATEGORY_1);
        expect(saved.user_limit).toBe(0);
        expect(saved.interface_channel_id).toBe(INTERFACE_1);
        expect(saved.default_channel_name).toBe("{user.display_name}'s Lounge");

        // RETURNING * and a fresh SELECT agree.
        expect(await getTempVoiceHubs(GUILD_A)).toEqual([saved]);
    });

    it("generates a uuid when no id is given", async () => {
        const saved = await saveTempVoiceHub(GUILD_A, validInput());

        expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it.each(["", "   "])("generates a uuid for a blank id %j", async (id) => {
        const saved = await saveTempVoiceHub(GUILD_A, validInput({ id }));

        expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("keeps a provided id", async () => {
        const saved = await saveTempVoiceHub(
            GUILD_A,
            validInput({ id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" })
        );

        expect(saved.id).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    });

    it("updates in place when the id already exists", async () => {
        const first = await saveTempVoiceHub(GUILD_A, validInput({ name: "Gaming" }));
        const second = await saveTempVoiceHub(
            GUILD_A,
            validInput({ id: first.id, name: "Chill", hub_channel_id: CHANNEL_1 })
        );

        expect(second.id).toBe(first.id);
        expect((await getTempVoiceHubs(GUILD_A))).toHaveLength(1);
        expect((await getTempVoiceHubs(GUILD_A))[0].name).toBe("Chill");
    });

    it("leaves guild_id alone on a cross-guild upsert", async () => {
        // The SET list has no guild_id, so replaying an id elsewhere renames but never moves the row.
        const first = await saveTempVoiceHub(GUILD_A, validInput({ name: "Gaming" }));

        await saveTempVoiceHub(GUILD_B, {
            ...validInput({ id: first.id, name: "Hijacked" }),
            guild_id: GUILD_B,
        });

        expect(await getTempVoiceHubs(GUILD_B)).toHaveLength(0);
        const [kept] = await getTempVoiceHubs(GUILD_A);
        expect(kept.id).toBe(first.id);
        expect(kept.name).toBe("Hijacked");
    });

    it("stores nulls for user_limit and interface_channel_id", async () => {
        const saved = await saveTempVoiceHub(GUILD_A, validInput());

        expect(saved.user_limit).toBeNull();
        expect(saved.interface_channel_id).toBeNull();

        const { rows } = await db.query<{ user_limit: number | null; interface_channel_id: string | null }>(
            "SELECT user_limit, interface_channel_id FROM temp_voice_hubs WHERE id = $1::uuid",
            [saved.id]
        );
        expect(rows[0]).toEqual({ user_limit: null, interface_channel_id: null });
    });

    it("rejects a second hub on the same trigger channel", async () => {
        await saveTempVoiceHub(GUILD_A, validInput());

        await expect(
            saveTempVoiceHub(GUILD_A, validInput({ category_id: CATEGORY_2 }))
        ).rejects.toThrow(/idx_temp_voice_hubs_unique_channel/);
    });

    it("allows the same trigger channel in a different guild", async () => {
        await saveTempVoiceHub(GUILD_A, validInput());
        await saveTempVoiceHub(GUILD_B, { ...validInput(), guild_id: GUILD_B });

        expect(await getTempVoiceHubs(GUILD_A)).toHaveLength(1);
        expect(await getTempVoiceHubs(GUILD_B)).toHaveLength(1);
    });

    it("rejects a second hub on the same category", async () => {
        await saveTempVoiceHub(GUILD_A, validInput());

        await expect(
            saveTempVoiceHub(GUILD_A, validInput({ hub_channel_id: CHANNEL_2 }))
        ).rejects.toThrow(/idx_temp_voice_hubs_unique_category/);
    });

    it.each([-1, 100])("rejects user_limit %i, which the migration forbids", async (user_limit) => {
        await expect(saveTempVoiceHub(GUILD_A, validInput({ user_limit }))).rejects.toThrow(
            /user_limit_limit/
        );
    });

    it("returns only the guild's hubs in creation order", async () => {
        await saveTempVoiceHub(GUILD_A, validInput({ name: "First" }));
        await saveTempVoiceHub(
            GUILD_A,
            validInput({ name: "Second", hub_channel_id: CHANNEL_2, category_id: CATEGORY_2 })
        );
        await saveTempVoiceHub(GUILD_B, { ...validInput({ name: "Theirs" }), guild_id: GUILD_B });

        const hubs = await getTempVoiceHubs(GUILD_A);

        expect(hubs.map((h) => h.name)).toEqual(["First", "Second"]);
    });

    it("deletes the guild's hub and hands its category to the backend", async () => {
        vi.mocked(backendFetch).mockResolvedValue(new Response("", { status: 200 }));
        const saved = await saveTempVoiceHub(GUILD_A, validInput());

        await deleteTempVoiceHub(GUILD_A, saved.id);

        expect(await getTempVoiceHubs(GUILD_A)).toHaveLength(0);
        expect(vi.mocked(backendFetch)).toHaveBeenCalledOnce();
    });

    it("refuses to delete another guild's hub and skips the backend", async () => {
        const foreign = await saveTempVoiceHub(GUILD_B, { ...validInput(), guild_id: GUILD_B });

        await deleteTempVoiceHub(GUILD_A, foreign.id);

        expect(vi.mocked(backendFetch)).not.toHaveBeenCalled();
        expect(await getTempVoiceHubs(GUILD_B)).toHaveLength(1);
    });
});
