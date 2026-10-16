import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/lib/db";
import {
    getGuildConfigField,
    saveGuildConfigField,
    replaceGuildConfigField,
} from "./guild";

// Redis invalidation is tested separately in unit tests.
// Mocking it here avoids hard dependencies on an external Redis instance.
vi.mock("@/lib/redis", () => ({
    default: {
        del: vi.fn().mockResolvedValue(1),
        publish: vi.fn().mockResolvedValue(1),
    },
}));

const GUILD_A = "123456789012345678";
const GUILD_B = "987654321098765432";

async function clearGuildConfigs(): Promise<void> {
    await db.query("DELETE FROM guild_configs WHERE guild_id IN ($1, $2)", [GUILD_A, GUILD_B]);
}

async function seedGuildConfig(guildId: string, settings: Record<string, unknown>): Promise<void> {
    await db.query(
        `INSERT INTO guild_configs (guild_id, settings)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (guild_id) DO UPDATE SET settings = EXCLUDED.settings`,
        [guildId, JSON.stringify(settings)]
    );
}

describe("guild_configs JSONB queries against a real database", () => {
    beforeEach(async () => {
        await clearGuildConfigs();
    });

    describe("getGuildConfigField", () => {
        it("returns null when guild does not exist in the database", async () => {
            const config = await getGuildConfigField(GUILD_A, "moderation");
            expect(config).toBeNull();
        });

        it("returns null when guild exists but requested key is not in settings", async () => {
            await seedGuildConfig(GUILD_A, { music: { volume: 50 } });

            const config = await getGuildConfigField(GUILD_A, "moderation");
            expect(config).toBeNull();
        });

        it("retrieves a nested JSONB object", async () => {
            await seedGuildConfig(GUILD_A, {
                moderation: {
                    logChannelId: "999",
                    filterProfanity: true,
                },
            });

            interface ModConfig {
                logChannelId: string;
                filterProfanity: boolean;
            }

            const config = await getGuildConfigField<ModConfig>(GUILD_A, "moderation");

            expect(config).toEqual({
                logChannelId: "999",
                filterProfanity: true,
            });
        });

        it("retrieves primitive JSONB values correctly", async () => {
            await seedGuildConfig(GUILD_A, { prefix: "!", maxTracks: 100, isVip: true });

            expect(await getGuildConfigField<string>(GUILD_A, "prefix")).toBe("!");
            expect(await getGuildConfigField<number>(GUILD_A, "maxTracks")).toBe(100);
            expect(await getGuildConfigField<boolean>(GUILD_A, "isVip")).toBe(true);
        });

        it("excludes keys from another guild", async () => {
            await seedGuildConfig(GUILD_A, { prefix: "!" });
            await seedGuildConfig(GUILD_B, { prefix: "?" });

            expect(await getGuildConfigField<string>(GUILD_A, "prefix")).toBe("!");
            expect(await getGuildConfigField<string>(GUILD_B, "prefix")).toBe("?");
        });
    });

    describe("saveGuildConfigField (shallow merge)", () => {
        it("inserts a new guild_configs row when one does not exist", async () => {
            await saveGuildConfigField(GUILD_A, "welcome", { enabled: true, channel: "123" });

            const config = await getGuildConfigField(GUILD_A, "welcome");
            expect(config).toEqual({ enabled: true, channel: "123" });
        });

        it("shallow merges into an existing JSONB object and preserves backend-only keys", async () => {
            // Seed with an existing backend-only property: category_id
            await seedGuildConfig(GUILD_A, {
                tickets: {
                    category_id: "backend_secret_cat",
                    transcript_channel: "chan_1",
                    enabled: true,
                },
            });

            // Frontend sends update without touching category_id
            await saveGuildConfigField(GUILD_A, "tickets", {
                transcript_channel: "chan_updated",
                ping_role: "mod_role",
            });

            const updated = await getGuildConfigField<Record<string, unknown>>(GUILD_A, "tickets");

            expect(updated).toEqual({
                category_id: "backend_secret_cat", // preserved
                transcript_channel: "chan_updated", // overwritten
                enabled: true,                      // preserved
                ping_role: "mod_role",              // appended
            });
        });

        it("preserves other unrelated top-level keys in settings during merge", async () => {
            await seedGuildConfig(GUILD_A, {
                leveling: { rate: 2 },
                music: { volume: 100 },
            });

            await saveGuildConfigField(GUILD_A, "leveling", { rate: 5 });

            expect(await getGuildConfigField(GUILD_A, "music")).toEqual({ volume: 100 });
            expect(await getGuildConfigField(GUILD_A, "leveling")).toEqual({ rate: 5 });
        });

        it("replaces cleanly when existing value is a primitive rather than an object", async () => {
            await seedGuildConfig(GUILD_A, { prefix: "!" });

            // Overwrite string with another string
            await saveGuildConfigField(GUILD_A, "prefix", "$");

            expect(await getGuildConfigField(GUILD_A, "prefix")).toBe("$");
        });

        it("replaces cleanly when transitioning from a primitive to an object", async () => {
            await seedGuildConfig(GUILD_A, { status: "inactive" });

            await saveGuildConfigField(GUILD_A, "status", { active: true, reason: "paid" });

            expect(await getGuildConfigField(GUILD_A, "status")).toEqual({
                active: true,
                reason: "paid",
            });
        });
    });

    describe("replaceGuildConfigField (full replace)", () => {
        it("inserts a new guild_configs row when guild does not exist", async () => {
            await replaceGuildConfigField(GUILD_A, "tickets", { enabled: false });

            const config = await getGuildConfigField(GUILD_A, "tickets");
            expect(config).toEqual({ enabled: false });
        });

        it("completely overwrites the object, removing omitted properties", async () => {
            await seedGuildConfig(GUILD_A, {
                tickets: {
                    category_id: "old_cat",
                    transcript_channel: "old_chan",
                    enabled: true,
                },
            });

            // Caller provides complete replacement; old keys should NOT merge
            await replaceGuildConfigField(GUILD_A, "tickets", {
                new_setting: "fresh",
            });

            const config = await getGuildConfigField(GUILD_A, "tickets");

            expect(config).toEqual({ new_setting: "fresh" });
            expect(config).not.toHaveProperty("category_id");
            expect(config).not.toHaveProperty("transcript_channel");
        });

        it("keeps other top-level keys untouched during full replace", async () => {
            await seedGuildConfig(GUILD_A, {
                tickets: { channel: "1" },
                automod: { enabled: true },
            });

            await replaceGuildConfigField(GUILD_A, "tickets", { channel: "2" });

            expect(await getGuildConfigField(GUILD_A, "automod")).toEqual({ enabled: true });
            expect(await getGuildConfigField(GUILD_A, "tickets")).toEqual({ channel: "2" });
        });

        it("replaces object with an array without merging into an object", async () => {
            await seedGuildConfig(GUILD_A, { blockedRoles: { role1: true } });

            await replaceGuildConfigField(GUILD_A, "blockedRoles", ["role_a", "role_b"]);

            const result = await getGuildConfigField(GUILD_A, "blockedRoles");
            expect(result).toEqual(["role_a", "role_b"]);
        });
    });
});