import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getHoneypotConfig, saveHoneypotConfig, setupHoneypot } from "./queries";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";
import { invalidateGuildChannelCache } from "@/features/_shared/channels";

vi.mock("@/features/_shared/guild", () => ({
    getGuildConfigField: vi.fn(),
    saveGuildConfigField: vi.fn(),
}));

vi.mock("@/features/_shared/channels", () => ({
    invalidateGuildChannelCache: vi.fn(),
}));

describe("Honeypot Query Module", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => {});
        process.env = { ...originalEnv, BACKEND_INTERNAL_URL: "http://backend:8080" };
    });

    afterEach(() => {
        process.env = originalEnv;
        vi.restoreAllMocks();
    });

    describe("getHoneypotConfig", () => {
        it("should return default config when DB returns null", async () => {
            vi.mocked(getGuildConfigField).mockResolvedValue(null);

            const result = await getHoneypotConfig("guild_123");

            expect(getGuildConfigField).toHaveBeenCalledWith("guild_123", "honeypot");
            expect(result.enabled).toBe(false);
            expect(result.channelId).toBeNull();
            expect(result.exemptRoles).toEqual([]);
            expect(result.dmd).toBe(3);
            expect(result.duration).toBeNull();
        });

        it("should merge partial saved DB config with Zod defaults", async () => {
            vi.mocked(getGuildConfigField).mockResolvedValue({
                enabled: true,
                channelId: "chan_1",
            });

            const result = await getHoneypotConfig("guild_123");

            expect(result.enabled).toBe(true);
            expect(result.channelId).toBe("chan_1");
            expect(result.exemptRoles).toEqual([]);
            expect(result.dmd).toBe(3);
        });

        it("should propagate a database error from getGuildConfigField", async () => {
            vi.mocked(getGuildConfigField).mockRejectedValue(new Error("connection lost"));

            await expect(getHoneypotConfig("guild_123")).rejects.toThrow("connection lost");
        });
    });

    describe("saveHoneypotConfig", () => {
        it("should save the config under the honeypot key", async () => {
            const config = honeypotConfigFixture();

            await saveHoneypotConfig("guild_123", config);

            expect(saveGuildConfigField).toHaveBeenCalledWith("guild_123", "honeypot", config);
        });

        it("should propagate a database error from saveGuildConfigField", async () => {
            vi.mocked(saveGuildConfigField).mockRejectedValue(new Error("connection lost"));

            await expect(
                saveHoneypotConfig("guild_123", honeypotConfigFixture())
            ).rejects.toThrow("connection lost");
        });
    });

    describe("setupHoneypot", () => {
        const mockFetch = vi.fn();

        beforeEach(() => {
            vi.stubGlobal("fetch", mockFetch);
        });

        afterEach(() => {
            vi.unstubAllGlobals();
        });

        function mockBackendOk(channelId: string) {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ channel_id: channelId }),
            });
        }

        it("should POST to the backend, save the channel, and return it", async () => {
            mockBackendOk("chan_honeypot");
            vi.mocked(getGuildConfigField).mockResolvedValue(null);

            const result = await setupHoneypot("guild_123", "dont-talk");

            expect(mockFetch).toHaveBeenCalledWith(
                "http://backend:8080/api/guilds/guild_123/honeypot",
                expect.objectContaining({ method: "POST" })
            );
            const [, init] = mockFetch.mock.calls[0];
            expect(JSON.parse(init.body)).toEqual({ channel_name: "dont-talk" });

            expect(invalidateGuildChannelCache).toHaveBeenCalledWith("guild_123");
            expect(saveGuildConfigField).toHaveBeenCalledWith(
                "guild_123",
                "honeypot",
                expect.objectContaining({
                    channelId: "chan_honeypot",
                    enabled: true,
                })
            );
            expect(result).toEqual({ channelId: "chan_honeypot" });
        });

        it("should preserve existing exempt roles and dmd when enabling", async () => {
            mockBackendOk("chan_honeypot");
            vi.mocked(getGuildConfigField).mockResolvedValue({
                enabled: false,
                exemptRoles: ["role_1"],
                dmd: 5,
            });

            await setupHoneypot("guild_123", "dont-talk");

            expect(saveGuildConfigField).toHaveBeenCalledWith(
                "guild_123",
                "honeypot",
                expect.objectContaining({
                    exemptRoles: ["role_1"],
                    dmd: 5,
                    channelId: "chan_honeypot",
                })
            );
        });

        it("should throw when the backend returns a non-OK response", async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                text: async () => "backend exploded",
            });

            await expect(setupHoneypot("guild_123", "dont-talk")).rejects.toThrow(
                "backend exploded"
            );
            expect(saveGuildConfigField).not.toHaveBeenCalled();
        });

        it("should throw a generic error when the backend returns no error text", async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                text: async () => "",
            });

            await expect(setupHoneypot("guild_123", "dont-talk")).rejects.toThrow(
                "Rust backend request failed."
            );
        });

        it("should REJECT an invalid backend response shape", async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ unexpected: "shape" }),
            });

            await expect(setupHoneypot("guild_123", "dont-talk")).rejects.toThrow();
            expect(saveGuildConfigField).not.toHaveBeenCalled();
        });

        it("should still save the config when cache invalidation fails", async () => {
            mockBackendOk("chan_honeypot");
            vi.mocked(getGuildConfigField).mockResolvedValue(null);
            vi.mocked(invalidateGuildChannelCache).mockRejectedValue(new Error("redis down"));

            const result = await setupHoneypot("guild_123", "dont-talk");

            expect(result.channelId).toBe("chan_honeypot");
        });
    });
});

function honeypotConfigFixture() {
    return {
        enabled: false,
        channelId: null,
        exemptRoles: [],
        dmd: 3,
        reason: "Sending a message in a honeypot channel",
        duration: null,
    };
}
