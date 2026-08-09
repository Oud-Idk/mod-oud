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
import { sendEmbedAction } from "@/features/embed-builder";
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

vi.mock("@/features/embed-builder", () => ({
    sendEmbedAction: vi.fn(),
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

        it("should fall back to 'Validation Error' when the zod error has no issues", async () => {
            vi.mocked(saveTempVoiceHub).mockRejectedValue(new z.ZodError([]));

            await expect(saveTempVoiceHubAction("guild_123", validHub)).rejects.toThrow(
                "Validation Error"
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

        it("should fall back to 'Validation Error' when the zod error has no issues", async () => {
            vi.mocked(deleteTempVoiceHub).mockRejectedValue(new z.ZodError([]));

            await expect(deleteTempVoiceHubAction("guild_123", "hub_1")).rejects.toThrow(
                "Validation Error"
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
            expect(init?.headers).toEqual({ "Content-Type": "application/json" });
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

        it("should fall back to 'Validation Error' when the zod error has no issues", async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                text: () => Promise.resolve(""),
                json: () => Promise.reject(new z.ZodError([])),
            });

            await expect(
                setupTempVoiceAction("guild_123", { categoryName: "Voice", hubChannelName: "Join" })
            ).rejects.toThrow("Validation Error");
        });
    });

    describe("sendInterfaceMessageAction", () => {
        it("should delegate to sendEmbedAction with the interface endpoint", async () => {
            const payload = {
                channelId: "chan_1",
                embedState: { title: "Temp Voice" },
            };
            vi.mocked(sendEmbedAction).mockResolvedValue({ messageId: "msg_1" });

            const result = await sendInterfaceMessageAction("guild_123", payload);

            const endpoint = vi.mocked(sendEmbedAction).mock.calls[0][0];
            expect(endpoint).toContain("/api/guilds/guild_123/temp-voice/interface/setup");
            expect(result).toEqual({ messageId: "msg_1" });
        });

        it("should throw the underlying error message", async () => {
            vi.mocked(sendEmbedAction).mockRejectedValue(new Error("backend down"));

            await expect(
                sendInterfaceMessageAction("guild_123", {
                    channelId: "chan_1",
                    embedState: { title: "Temp Voice" },
                })
            ).rejects.toThrow("backend down");
        });

        it("should rethrow the first zod issue message when sendEmbedAction rejects with a ZodError", async () => {
            vi.mocked(sendEmbedAction).mockRejectedValue(
                new z.ZodError([
                    { code: "custom", message: "Interface message validation failure", path: [] },
                ])
            );

            await expect(
                sendInterfaceMessageAction("guild_123", {
                    channelId: "chan_1",
                    embedState: { title: "Temp Voice" },
                })
            ).rejects.toThrow("Interface message validation failure");
        });

        it("should fall back to 'Validation Error' when the zod error has no issues", async () => {
            vi.mocked(sendEmbedAction).mockRejectedValue(new z.ZodError([]));

            await expect(
                sendInterfaceMessageAction("guild_123", {
                    channelId: "chan_1",
                    embedState: { title: "Temp Voice" },
                })
            ).rejects.toThrow("Validation Error");
        });
    });
});
