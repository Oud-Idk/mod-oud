import { beforeEach, describe, expect, it, vi } from "vitest";
import { backendFetch } from "@/lib/backend";
import { invalidateGuildChannelCache } from "@/features/_shared/channels";
import { getHoneypotConfig, saveHoneypotConfig, setupHoneypot } from "./queries";
import type { HoneypotConfig } from "./types";

vi.mock("@/lib/backend", () => ({
    backendFetch: vi.fn(),
}));

vi.mock("@/features/_shared/channels", () => ({
    invalidateGuildChannelCache: vi.fn(),
}));

// Backend failure shapes and header bytes stay in queries.test.ts with a
// mocked backend. What lives here is the real Postgres behaviour: JSONB
// round-trips, tenant scoping, and the setup flow end to end.

const GUILD_A = "123456789012345678";
const GUILD_B = "987654321098765432";

function configFixture(overrides: Partial<HoneypotConfig> = {}): HoneypotConfig {
    return {
        enabled: false,
        channelId: null,
        exemptRoles: [],
        dmd: 3,
        reason: "Sending a message in a honeypot channel",
        duration: null,
        ...overrides,
    };
}

function backendOk(channelId: string): Response {
    return new Response(JSON.stringify({ channel_id: channelId }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
}

beforeEach(() => {
    vi.mocked(backendFetch).mockReset();
    vi.mocked(invalidateGuildChannelCache).mockReset();
    vi.mocked(invalidateGuildChannelCache).mockResolvedValue(undefined);
});

describe("honeypot config against a real database", () => {
    it("returns defaults when the guild has no config row", async () => {
        expect(await getHoneypotConfig(GUILD_A)).toEqual(configFixture());
    });

    it("round-trips a saved config through the JSONB column", async () => {
        const stored = configFixture({
            enabled: true,
            channelId: "111111111111111111",
            exemptRoles: ["222222222222222222"],
            dmd: 5,
        });

        await saveHoneypotConfig(GUILD_A, stored);

        expect(await getHoneypotConfig(GUILD_A)).toEqual(stored);
    });

    it("keeps one guild's config out of another's", async () => {
        await saveHoneypotConfig(
            GUILD_A,
            configFixture({ enabled: true, channelId: "111111111111111111" })
        );

        expect(await getHoneypotConfig(GUILD_B)).toEqual(configFixture());
    });
});

describe("setupHoneypot against a real database", () => {
    it("saves the backend channel and enables the config", async () => {
        vi.mocked(backendFetch).mockResolvedValue(backendOk("chan_honeypot"));
        await saveHoneypotConfig(
            GUILD_A,
            configFixture({ exemptRoles: ["222222222222222222"], dmd: 5 })
        );

        const result = await setupHoneypot(GUILD_A, "dont-talk");

        expect(result).toEqual({ channelId: "chan_honeypot" });
        expect(backendFetch).toHaveBeenCalledWith(`/api/guilds/${GUILD_A}/honeypot`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ channel_name: "dont-talk" }),
        });
        expect(invalidateGuildChannelCache).toHaveBeenCalledWith(GUILD_A);
        expect(await getHoneypotConfig(GUILD_A)).toEqual(
            configFixture({
                enabled: true,
                channelId: "chan_honeypot",
                exemptRoles: ["222222222222222222"],
                dmd: 5,
            })
        );
    });

    it("leaves the stored config alone when the backend rejects", async () => {
        vi.mocked(backendFetch).mockResolvedValue(new Response("nope", { status: 500 }));

        await expect(setupHoneypot(GUILD_A, "dont-talk")).rejects.toThrow(new Error("nope"));
        expect(vi.mocked(invalidateGuildChannelCache)).not.toHaveBeenCalled();
        expect(await getHoneypotConfig(GUILD_A)).toEqual(configFixture());
    });
});
