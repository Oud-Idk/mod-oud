import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { z } from "zod";
import {
    saveTempVoiceHubAction,
    deleteTempVoiceHubAction,
    setupTempVoiceAction,
    sendInterfaceMessageAction,
} from "./actions";
import { deleteTempVoiceHub, saveTempVoiceHub } from "./queries";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { invalidateGuildChannelCache } from "@/features/_shared/channels";
import { revalidatePath } from "next/cache";
import type { SaveTempVoiceHubInput, TempVoiceHub } from "./types";

interface MockResponse {
    ok: boolean;
    text(): Promise<string>;
    json(): Promise<unknown>;
}

const mockFetch = vi.hoisted(() =>
    vi.fn<(url: string, init?: RequestInit) => Promise<MockResponse>>()
);

vi.mock("@/features/_shared/guild", () => ({
    verifyGuildAccess: vi.fn(),
}));

vi.mock("@/features/_shared/channels", () => ({
    invalidateGuildChannelCache: vi.fn(),
}));

vi.mock("./queries", () => ({
    deleteTempVoiceHub: vi.fn(),
    saveTempVoiceHub: vi.fn(),
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

vi.stubGlobal("fetch", mockFetch);

const validHub: SaveTempVoiceHubInput = {
    guild_id: "guild_123",
    name: "Gaming",
    hub_channel_id: "chan_1",
    category_id: "cat_1",
    default_channel_name: "{user.display_name}'s Lounge",
};

function hubFixture(): TempVoiceHub {
    return {
        id: "hub_1",
        guild_id: "guild_123",
        name: "Gaming",
        hub_channel_id: "chan_1",
        category_id: "cat_1",
        user_limit: null,
        interface_channel_id: null,
        default_channel_name: "{user.display_name}'s Lounge",
    };
}

describe("Temp Voice Action Module", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("saveTempVoiceHubAction", () => {
        it("should verify access, save the hub, and revalidate", async () => {
            const saved = hubFixture();
            vi.mocked(saveTempVoiceHub).mockResolvedValue(saved);

            const result = await saveTempVoiceHubAction("guild_123", validHub);

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(saveTempVoiceHub).toHaveBeenCalled();
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/temp-voice");
            expect(result).toEqual(saved);
        });

        it("should throw the first zod issue message for invalid input", async () => {
            const invalid = { ...validHub, hub_channel_id: undefined };

            await expect(saveTempVoiceHubAction("guild_123", invalid)).rejects.toThrow(
                "Please select a trigger voice channel."
            );
            expect(saveTempVoiceHub).not.toHaveBeenCalled();
        });

        it("should throw the underlying error message", async () => {
            vi.mocked(saveTempVoiceHub).mockRejectedValue(new Error("db down"));

            await expect(saveTempVoiceHubAction("guild_123", validHub)).rejects.toThrow("db down");
        });

        it("should rethrow the first zod issue message when saving rejects with a ZodError", async () => {
            vi.mocked(saveTempVoiceHub).mockRejectedValue(
                new z.ZodError([
                    { code: "custom", message: "Temp voice hub save validation failure", path: [] },
                ])
            );

            await expect(saveTempVoiceHubAction("guild_123", validHub)).rejects.toThrow(
                "Temp voice hub save validation failure"
            );
        });

    });

    describe("deleteTempVoiceHubAction", () => {
        it("should verify access, delete the hub, and revalidate", async () => {
            await deleteTempVoiceHubAction("guild_123", "hub_1");

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(deleteTempVoiceHub).toHaveBeenCalledWith("guild_123", "hub_1");
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/temp-voice");
        });

        it("should throw the underlying error message", async () => {
            vi.mocked(deleteTempVoiceHub).mockRejectedValue(new Error("db down"));

            await expect(deleteTempVoiceHubAction("guild_123", "hub_1")).rejects.toThrow("db down");
        });

        it("should rethrow the first zod issue message when deletion rejects with a ZodError", async () => {
            vi.mocked(deleteTempVoiceHub).mockRejectedValue(
                new z.ZodError([
                    { code: "custom", message: "Temp voice hub delete validation failure", path: [] },
                ])
            );

            await expect(deleteTempVoiceHubAction("guild_123", "hub_1")).rejects.toThrow(
                "Temp voice hub delete validation failure"
            );
        });

    });

    describe("setupTempVoiceAction", () => {
        it("should call the backend, parse the response, and invalidate the channel cache", async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                text: () => Promise.resolve(""),
                json: () => Promise.resolve({
                    category_id: "cat_1",
                    hub_channel_id: "chan_1",
                    interface_channel_id: "chan_2",
                }),
            });

            const result = await setupTempVoiceAction("guild_123", {
                categoryName: "Voice",
                hubChannelName: "Join to Create",
            });

            const url = mockFetch.mock.calls[0][0];
            expect(url).toContain("/api/guilds/guild_123/temp-voice/setup");
            const init = mockFetch.mock.calls[0][1];
            expect(init?.method).toBe("POST");
            expect(typeof init?.body).toBe("string");
            const bodyText = typeof init?.body === "string" ? init.body : "";
            expect(bodyText).toContain('"category_name":"Voice"');
            expect(bodyText).toContain('"hub_channel_name":"Join to Create"');
            expect(bodyText).toContain('"user_limit":null');
            expect(invalidateGuildChannelCache).toHaveBeenCalledWith("guild_123");
            expect(result).toEqual({
                categoryId: "cat_1",
                hubChannelId: "chan_1",
                interfaceChannelId: "chan_2",
            });
        });

        it("should throw the backend error text on failure", async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                text: () => Promise.resolve("setup failed"),
                json: () => Promise.resolve({}),
            });

            await expect(
                setupTempVoiceAction("guild_123", { categoryName: "Voice", hubChannelName: "Join" })
            ).rejects.toThrow("setup failed");
        });

        it("should throw the first zod issue message for invalid input", async () => {
            await expect(
                setupTempVoiceAction("guild_123", { categoryName: "", hubChannelName: "Join" })
            ).rejects.toThrow("Category name cannot be empty");
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it("should rethrow the first zod issue message when the backend response fails validation", async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                text: () => Promise.resolve(""),
                json: () =>
                    Promise.reject(
                        new z.ZodError([
                            {
                                code: "custom",
                                message: "Temp voice setup validation failure",
                                path: [],
                            },
                        ])
                    ),
            });

            await expect(
                setupTempVoiceAction("guild_123", { categoryName: "Voice", hubChannelName: "Join" })
            ).rejects.toThrow("Temp voice setup validation failure");
        });

    });

    describe("sendInterfaceMessageAction", () => {
        it("should call the backend interface endpoint with camelCase fields", async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                text: () => Promise.resolve(""),
                json: () => Promise.resolve({ message_id: "msg_1" }),
            });

            const payload = {
                channelId: "chan_1",
                embedState: { title: "Temp Voice" },
            };

            const result = await sendInterfaceMessageAction("guild_123", payload);

            const url = mockFetch.mock.calls[0][0];
            expect(url).toContain("/api/guilds/guild_123/temp-voice/interface/setup");
            const init = mockFetch.mock.calls[0][1];
            expect(init?.method).toBe("POST");
            // oxlint-disable-next-line typescript/no-unsafe-assignment
            const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
            expect(body).toEqual({
                channelId: "chan_1",
                embedState: { title: "Temp Voice" },
            });
            expect(result).toEqual({ messageId: "msg_1" });
        });

        it("should throw the backend error text on failure", async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                text: () => Promise.resolve("backend down"),
                json: () => Promise.resolve({}),
            });

            await expect(
                sendInterfaceMessageAction("guild_123", {
                    channelId: "chan_1",
                    embedState: { title: "Temp Voice" },
                })
            ).rejects.toThrow("backend down");
        });

        it("should throw the first zod issue message for invalid input", async () => {
            await expect(
                sendInterfaceMessageAction("guild_123", {
                    channelId: "",
                    embedState: { title: "Temp Voice" },
                })
            ).rejects.toThrow("Channel ID is required");
            expect(mockFetch).not.toHaveBeenCalled();
        });
    });
});
