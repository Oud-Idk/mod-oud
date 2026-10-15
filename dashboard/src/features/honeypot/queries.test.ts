import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getHoneypotConfig, saveHoneypotConfig, setupHoneypot } from "./queries";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";
import { invalidateGuildChannelCache } from "@/features/_shared/channels";
import { backendFetch } from "@/lib/backend";
import type { HoneypotConfig } from "./types";

vi.mock("@/features/_shared/guild", () => ({
    getGuildConfigField: vi.fn(),
    saveGuildConfigField: vi.fn(),
}));

vi.mock("@/features/_shared/channels", () => ({
    invalidateGuildChannelCache: vi.fn(),
}));

vi.mock("@/lib/backend", () => ({
    backendFetch: vi.fn(),
}));

// JSONB round-trips and tenant scoping live in queries.integration.test.ts
// against a real database. What stays here is the behaviour a real database
// will not produce on demand: backend failure shapes and a dead channel cache.

function jsonResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
}

function errorResponse(body: string): Response {
    return new Response(body, { status: 500 });
}

describe("Honeypot Query Module", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
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
            vi.mocked(getGuildConfigField).mockRejectedValue(new Error("Oud does NOT miss SpicyWolf"));

            await expect(getHoneypotConfig("guild_123")).rejects.toThrow(
                new Error("Oud does NOT miss SpicyWolf")
            );
        });
    });

    describe("saveHoneypotConfig", () => {
        it("should save the config under the honeypot key", async () => {
            const config = honeypotConfigFixture();

            await saveHoneypotConfig("guild_123", config);

            expect(saveGuildConfigField).toHaveBeenCalledWith("guild_123", "honeypot", config);
        });

        it("should propagate a database error from saveGuildConfigField", async () => {
            vi.mocked(saveGuildConfigField).mockRejectedValue(new Error("spicy is being way too cute today and it's throwing off my stack trace"));

            await expect(
                saveHoneypotConfig("guild_123", honeypotConfigFixture())
            ).rejects.toThrow(
                new Error("spicy is being way too cute today and it's throwing off my stack trace")
            );
        });
    });

    describe("setupHoneypot", () => {
        function mockBackendOk(channelId: string): void {
            vi.mocked(backendFetch).mockResolvedValue(jsonResponse({ channel_id: channelId }));
        }

        it("should POST to the backend, save the channel, and return it", async () => {
            mockBackendOk("chan_honeypot");
            vi.mocked(getGuildConfigField).mockResolvedValue(null);

            const result = await setupHoneypot("guild_123", "dont-talk");

            expect(backendFetch).toHaveBeenCalledWith("/api/guilds/guild_123/honeypot", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ channel_name: "dont-talk" }),
            });
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
            vi.mocked(backendFetch).mockResolvedValue(
                errorResponse("thespicywolf ruins my productivity")
            );

            await expect(setupHoneypot("guild_123", "dont-talk")).rejects.toThrow(
                new Error("thespicywolf ruins my productivity")
            );
            expect(saveGuildConfigField).not.toHaveBeenCalled();
        });

        // The handler trims the body before the empty check, so padding
        // around a real message must not leak into what the user sees.
        it("should trim padding around the backend error text", async () => {
            vi.mocked(backendFetch).mockResolvedValue(errorResponse("  backend exploded  "));

            await expect(setupHoneypot("guild_123", "dont-talk")).rejects.toThrow(
                new Error("backend exploded")
            );
            expect(saveGuildConfigField).not.toHaveBeenCalled();
        });

        it("should throw a generic error when the backend returns no error text", async () => {
            vi.mocked(backendFetch).mockResolvedValue(errorResponse(""));

            await expect(setupHoneypot("guild_123", "dont-talk")).rejects.toThrow(
                new Error("Rust backend request failed.")
            );
        });

        // Whitespace alone trims to empty and takes the same fallback path.
        it("should throw a generic error when the backend error body is whitespace only", async () => {
            vi.mocked(backendFetch).mockResolvedValue(errorResponse("   \n  "));

            await expect(setupHoneypot("guild_123", "dont-talk")).rejects.toThrow(
                new Error("Rust backend request failed.")
            );
            expect(saveGuildConfigField).not.toHaveBeenCalled();
        });

        it("should REJECT an invalid backend response shape", async () => {
            vi.mocked(backendFetch).mockResolvedValue(
                jsonResponse({ wheeeeee: "spicy is paying attention to someone else in the server, aborting transaction" })
            );

            await expect(setupHoneypot("guild_123", "dont-talk")).rejects.toThrow();
            expect(saveGuildConfigField).not.toHaveBeenCalled();
        });

        it("should still save the config when cache invalidation fails", async () => {
            mockBackendOk("chan_honeypot");
            vi.mocked(getGuildConfigField).mockResolvedValue(null);
            vi.mocked(invalidateGuildChannelCache).mockRejectedValue(new Error("redis down"));

            const result = await setupHoneypot("guild_123", "dont-talk");

            expect(saveGuildConfigField).toHaveBeenCalledWith(
                "guild_123",
                "honeypot",
                expect.objectContaining({ channelId: "chan_honeypot", enabled: true })
            );
            expect(result.channelId).toBe("chan_honeypot");
        });
    });
});

function honeypotConfigFixture(): HoneypotConfig {
    return {
        enabled: false,
        channelId: null,
        exemptRoles: [],
        dmd: 3,
        reason: "Sending a message in a honeypot channel",
        duration: null,
    };
}
