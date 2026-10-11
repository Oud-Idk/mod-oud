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
import { saveTempVoiceHubInputSchema } from "./types";
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

const GUILD_ID = "guild_123";
const TEMP_VOICE_PATH = `/dashboard/${GUILD_ID}/temp-voice`;

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

function authorize(): void {
    vi.mocked(verifyGuildAccess).mockResolvedValue({
        id: "user_123",
        name: "Test User",
    });
}

function denyAccess(message = "Forbidden: You do not have permission to manage this server."): void {
    vi.mocked(verifyGuildAccess).mockRejectedValue(new Error(message));
}

// `rejects.toThrow("...")` is a substring match, and a leaked ZodError's JSON
// payload also contains the first issue's text, so only an exact comparison can
// tell a proper `issues[0].message` rethrow apart from an unwrapped error.
async function rejectionMessage(promise: Promise<unknown>): Promise<string> {
    try {
        await promise;
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
    throw new Error("Expected the promise to reject, but it resolved.");
}

function backendOk(payload: unknown): void {
    mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(""),
        json: () => Promise.resolve(payload),
    });
}

function backendFails(text: string): void {
    mockFetch.mockResolvedValue({
        ok: false,
        text: () => Promise.resolve(text),
        json: () => Promise.resolve({}),
    });
}

function requestBody(call = 0): unknown {
    const init = mockFetch.mock.calls[call]?.[1];
    return typeof init?.body === "string" ? JSON.parse(init.body) : null;
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
            authorize();
            const saved = hubFixture();
            vi.mocked(saveTempVoiceHub).mockResolvedValue(saved);

            const result = await saveTempVoiceHubAction(GUILD_ID, validHub);

            expect(verifyGuildAccess).toHaveBeenCalledWith(GUILD_ID);
            // The action hands the query the Zod-parsed hub, which carries the
            // defaulted id and nullish fields the raw input left out.
            expect(saveTempVoiceHub).toHaveBeenCalledWith(
                GUILD_ID,
                saveTempVoiceHubInputSchema.parse(validHub)
            );
            expect(revalidatePath).toHaveBeenCalledWith(TEMP_VOICE_PATH);
            expect(result).toEqual(saved);
        });

        it("should save the Zod-parsed hub rather than the raw input", async () => {
            authorize();
            vi.mocked(saveTempVoiceHub).mockResolvedValue(hubFixture());

            await saveTempVoiceHubAction(GUILD_ID, { ...validHub, id: "  " });

            // The schema trims a blank id to null so the insert falls back to
            // gen_random_uuid() instead of writing a whitespace key.
            expect(saveTempVoiceHub).toHaveBeenCalledWith(
                GUILD_ID,
                expect.objectContaining({ id: null, user_limit: null, interface_channel_id: null })
            );
        });

        it("should NOT save when verifyGuildAccess throws", async () => {
            denyAccess();

            await expect(saveTempVoiceHubAction(GUILD_ID, validHub)).rejects.toThrow(
                "Forbidden: You do not have permission to manage this server."
            );

            expect(saveTempVoiceHub).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should NOT revalidate when the save fails", async () => {
            authorize();
            vi.mocked(saveTempVoiceHub).mockRejectedValue(new Error("db down"));

            await expect(saveTempVoiceHubAction(GUILD_ID, validHub)).rejects.toThrow("db down");

            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should throw the first zod issue message for a missing trigger channel", async () => {
            authorize();

            await expect(
                rejectionMessage(
                    saveTempVoiceHubAction(GUILD_ID, { ...validHub, hub_channel_id: undefined })
                )
            ).resolves.toBe("Please select a trigger voice channel.");

            expect(saveTempVoiceHub).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should throw the first zod issue message for a missing category", async () => {
            authorize();

            await expect(
                rejectionMessage(
                    saveTempVoiceHubAction(GUILD_ID, { ...validHub, category_id: undefined })
                )
            ).resolves.toBe("Please select a parent category.");

            expect(saveTempVoiceHub).not.toHaveBeenCalled();
        });

        it("should propagate a database error", async () => {
            authorize();
            vi.mocked(saveTempVoiceHub).mockRejectedValue(new Error("connection lost"));

            await expect(saveTempVoiceHubAction(GUILD_ID, validHub)).rejects.toThrow(
                "connection lost"
            );
        });

        it("should throw the save fallback message on a non-Error exception", async () => {
            authorize();
            vi.mocked(saveTempVoiceHub).mockRejectedValue("kaboom");

            await expect(saveTempVoiceHubAction(GUILD_ID, validHub)).rejects.toThrow(
                "Could not save configuration."
            );
        });

        it("should rethrow the first zod issue message when saving rejects with a ZodError", async () => {
            authorize();
            vi.mocked(saveTempVoiceHub).mockRejectedValue(
                new z.ZodError([
                    {
                        code: "custom",
                        message: "Temp voice hub save validation failure",
                        path: [],
                    },
                ])
            );

            await expect(saveTempVoiceHubAction(GUILD_ID, validHub)).rejects.toThrow(
                "Temp voice hub save validation failure"
            );
        });
    });

    describe("deleteTempVoiceHubAction", () => {
        it("should verify access, delete the hub, and revalidate", async () => {
            authorize();

            await deleteTempVoiceHubAction(GUILD_ID, "hub_1");

            expect(verifyGuildAccess).toHaveBeenCalledWith(GUILD_ID);
            expect(deleteTempVoiceHub).toHaveBeenCalledWith(GUILD_ID, "hub_1");
            expect(revalidatePath).toHaveBeenCalledWith(TEMP_VOICE_PATH);
        });

        it("should NOT delete when verifyGuildAccess throws", async () => {
            denyAccess();

            await expect(deleteTempVoiceHubAction(GUILD_ID, "hub_1")).rejects.toThrow("Forbidden");

            expect(deleteTempVoiceHub).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should NOT revalidate when the delete fails", async () => {
            authorize();
            vi.mocked(deleteTempVoiceHub).mockRejectedValue(new Error("db down"));

            await expect(deleteTempVoiceHubAction(GUILD_ID, "hub_1")).rejects.toThrow("db down");

            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should propagate a database error", async () => {
            authorize();
            vi.mocked(deleteTempVoiceHub).mockRejectedValue(new Error("connection lost"));

            await expect(deleteTempVoiceHubAction(GUILD_ID, "hub_1")).rejects.toThrow(
                "connection lost"
            );
        });

        it("should throw the delete fallback message on a non-Error exception", async () => {
            authorize();
            vi.mocked(deleteTempVoiceHub).mockRejectedValue("kaboom");

            await expect(deleteTempVoiceHubAction(GUILD_ID, "hub_1")).rejects.toThrow(
                "Could not delete configuration."
            );
        });

        it("should rethrow the first zod issue message when deletion rejects with a ZodError", async () => {
            authorize();
            vi.mocked(deleteTempVoiceHub).mockRejectedValue(
                new z.ZodError([
                    {
                        code: "custom",
                        message: "Temp voice hub delete validation failure",
                        path: [],
                    },
                ])
            );

            await expect(deleteTempVoiceHubAction(GUILD_ID, "hub_1")).rejects.toThrow(
                "Temp voice hub delete validation failure"
            );
        });
    });

    describe("setupTempVoiceAction", () => {
        const payload = { categoryName: "Voice", hubChannelName: "Join to Create" };

        it("should verify access before calling the backend", async () => {
            authorize();
            backendOk({
                category_id: "cat_1",
                hub_channel_id: "chan_1",
                interface_channel_id: "chan_2",
            });

            await setupTempVoiceAction(GUILD_ID, payload);

            expect(verifyGuildAccess).toHaveBeenCalledWith(GUILD_ID);
        });

        it("should NOT call the backend when verifyGuildAccess throws", async () => {
            denyAccess();

            await expect(setupTempVoiceAction(GUILD_ID, payload)).rejects.toThrow("Forbidden");

            expect(mockFetch).not.toHaveBeenCalled();
            expect(invalidateGuildChannelCache).not.toHaveBeenCalled();
        });

        it("should call the backend, parse the response, and invalidate the channel cache", async () => {
            authorize();
            backendOk({
                category_id: "cat_1",
                hub_channel_id: "chan_1",
                interface_channel_id: "chan_2",
            });

            const result = await setupTempVoiceAction(GUILD_ID, payload);

            const url = mockFetch.mock.calls[0][0];
            expect(url).toContain(`/api/guilds/${GUILD_ID}/temp-voice/setup`);
            const init = mockFetch.mock.calls[0][1];
            expect(init?.method).toBe("POST");
            expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
            expect(invalidateGuildChannelCache).toHaveBeenCalledWith(GUILD_ID);
            expect(result).toEqual({
                categoryId: "cat_1",
                hubChannelId: "chan_1",
                interfaceChannelId: "chan_2",
            });
        });

        it("should send the mapped body with user_limit left to the bot", async () => {
            authorize();
            backendOk({ category_id: "cat_1", hub_channel_id: "chan_1" });

            await setupTempVoiceAction(GUILD_ID, payload);

            expect(requestBody()).toEqual({
                category_name: "Voice",
                hub_channel_name: "Join to Create",
                user_limit: null,
            });
        });

        // The backend omits the interface channel when the guild has no
        // interface message set up, and the action has to surface that as
        // undefined rather than a null the caller would render.
        it("should report a missing interface channel as undefined", async () => {
            authorize();
            backendOk({ category_id: "cat_1", hub_channel_id: "chan_1" });

            const result = await setupTempVoiceAction(GUILD_ID, payload);

            expect(result.interfaceChannelId).toBeUndefined();
            expect(result).not.toHaveProperty("interfaceChannelId", null);
        });

        it("should keep an explicit null interface channel as undefined", async () => {
            authorize();
            backendOk({
                category_id: "cat_1",
                hub_channel_id: "chan_1",
                interface_channel_id: null,
            });

            const result = await setupTempVoiceAction(GUILD_ID, payload);

            expect(result.interfaceChannelId).toBeUndefined();
        });

        it("should NOT invalidate the channel cache when the backend fails", async () => {
            authorize();
            backendFails("setup failed");

            await expect(setupTempVoiceAction(GUILD_ID, payload)).rejects.toThrow("setup failed");

            expect(invalidateGuildChannelCache).not.toHaveBeenCalled();
        });

        it("should throw the backend error text on failure", async () => {
            authorize();
            backendFails("setup failed");

            await expect(setupTempVoiceAction(GUILD_ID, payload)).rejects.toThrow("setup failed");
        });

        // An empty error body would otherwise surface as an empty Error message.
        it("should fall back to a readable message when the backend returns no text", async () => {
            authorize();
            backendFails("");

            await expect(setupTempVoiceAction(GUILD_ID, payload)).rejects.toThrow(
                "The backend rejected the channel setup."
            );
        });

        it("should throw the first zod issue message for invalid input", async () => {
            authorize();

            await expect(
                rejectionMessage(setupTempVoiceAction(GUILD_ID, { categoryName: "", hubChannelName: "Join" }))
            ).resolves.toBe("Category name cannot be empty");

            expect(mockFetch).not.toHaveBeenCalled();
            expect(invalidateGuildChannelCache).not.toHaveBeenCalled();
        });

        it("should reject a backend response that is missing the hub channel id", async () => {
            authorize();
            backendOk({ category_id: "cat_1" });

            await expect(setupTempVoiceAction(GUILD_ID, payload)).rejects.toThrow();
            expect(invalidateGuildChannelCache).not.toHaveBeenCalled();
        });

        it("should propagate a backend transport error", async () => {
            authorize();
            mockFetch.mockRejectedValue(new Error("connection reset"));

            await expect(setupTempVoiceAction(GUILD_ID, payload)).rejects.toThrow(
                "connection reset"
            );
            expect(invalidateGuildChannelCache).not.toHaveBeenCalled();
        });

        it("should throw the setup fallback message on a non-Error exception", async () => {
            authorize();
            mockFetch.mockRejectedValue("kaboom");

            await expect(setupTempVoiceAction(GUILD_ID, payload)).rejects.toThrow(
                "Could not setup temp voice hub."
            );
        });

        it("should rethrow the first zod issue message when the backend response fails validation", async () => {
            authorize();
            backendOk({ category_id: "cat_1", hub_channel_id: "chan_1" });
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

            await expect(setupTempVoiceAction(GUILD_ID, payload)).rejects.toThrow(
                "Temp voice setup validation failure"
            );
        });
    });

    describe("sendInterfaceMessageAction", () => {
        const payload = { channelId: "chan_1", embedState: { title: "Temp Voice" } };

        it("should verify access with the validated guild id", async () => {
            authorize();
            backendOk({ message_id: "msg_1" });

            await sendInterfaceMessageAction(GUILD_ID, payload);

            expect(verifyGuildAccess).toHaveBeenCalledWith(GUILD_ID);
        });

        it("should NOT call the backend when verifyGuildAccess throws", async () => {
            denyAccess();

            await expect(sendInterfaceMessageAction(GUILD_ID, payload)).rejects.toThrow("Forbidden");

            expect(mockFetch).not.toHaveBeenCalled();
        });

        // This action validates before it authorizes, the reverse of the other
        // three. Pinned so the ordering is a deliberate choice rather than drift.
        it("should validate the payload before authorizing", async () => {
            authorize();

            await expect(
                sendInterfaceMessageAction(GUILD_ID, { channelId: "", embedState: { title: "x" } })
            ).rejects.toThrow("Channel ID is required");

            expect(verifyGuildAccess).not.toHaveBeenCalled();
        });

        it("should reject an empty guild id before authorizing", async () => {
            authorize();

            await expect(sendInterfaceMessageAction("", payload)).rejects.toThrow(
                "Guild ID is required"
            );

            expect(verifyGuildAccess).not.toHaveBeenCalled();
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it("should reject an embed with no visible content", async () => {
            authorize();

            await expect(
                rejectionMessage(
                    sendInterfaceMessageAction(GUILD_ID, { channelId: "chan_1", embedState: {} })
                )
            ).resolves.toBe("Embed must have at least a title, description, or visible content!");

            expect(mockFetch).not.toHaveBeenCalled();
        });

        it("should call the backend interface endpoint with camelCase fields", async () => {
            authorize();
            backendOk({ message_id: "msg_1" });

            const result = await sendInterfaceMessageAction(GUILD_ID, payload);

            const url = mockFetch.mock.calls[0][0];
            expect(url).toContain(`/api/guilds/${GUILD_ID}/temp-voice/interface/setup`);
            const init = mockFetch.mock.calls[0][1];
            expect(init?.method).toBe("POST");
            expect(requestBody()).toEqual({
                channelId: "chan_1",
                embedState: { title: "Temp Voice" },
            });
            expect(result).toEqual({ messageId: "msg_1" });
        });

        it("should forward the parsed embed rather than the raw payload", async () => {
            authorize();
            backendOk({ message_id: "msg_1" });

            await sendInterfaceMessageAction(GUILD_ID, {
                channelId: "chan_1",
                embedState: { title: "Temp Voice", color: 255 },
            });

            expect(requestBody()).toEqual({
                channelId: "chan_1",
                embedState: { title: "Temp Voice", color: 255 },
            });
        });

        it("should reject a backend response with no message id", async () => {
            authorize();
            backendOk({});

            await expect(sendInterfaceMessageAction(GUILD_ID, payload)).rejects.toThrow();
        });

        it("should throw the backend error text on failure", async () => {
            authorize();
            backendFails("backend down");

            await expect(sendInterfaceMessageAction(GUILD_ID, payload)).rejects.toThrow(
                "backend down"
            );
        });

        it("should fall back to a readable message when the backend returns no text", async () => {
            authorize();
            backendFails("");

            await expect(sendInterfaceMessageAction(GUILD_ID, payload)).rejects.toThrow(
                "Backend returned an error state."
            );
        });

        it("should throw the first zod issue message for invalid input", async () => {
            authorize();

            await expect(
                rejectionMessage(
                    sendInterfaceMessageAction(GUILD_ID, {
                        channelId: "",
                        embedState: { title: "Temp Voice" },
                    })
                )
            ).resolves.toBe("Channel ID is required");

            expect(mockFetch).not.toHaveBeenCalled();
        });

        it("should propagate a backend transport error", async () => {
            authorize();
            mockFetch.mockRejectedValue(new Error("connection reset"));

            await expect(sendInterfaceMessageAction(GUILD_ID, payload)).rejects.toThrow(
                "connection reset"
            );
        });

        it("should throw the interface fallback message on a non-Error exception", async () => {
            authorize();
            mockFetch.mockRejectedValue("kaboom");

            await expect(sendInterfaceMessageAction(GUILD_ID, payload)).rejects.toThrow(
                "Failed to communicate with backend server."
            );
        });

        // The message is posted live, so the tab has to re-render when it lands.
        it("should NOT revalidate the temp voice path", async () => {
            authorize();
            backendOk({ message_id: "msg_1" });

            await sendInterfaceMessageAction(GUILD_ID, payload);

            expect(revalidatePath).not.toHaveBeenCalled();
        });
    });
});