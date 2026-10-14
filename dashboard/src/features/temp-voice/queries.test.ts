import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    getTempVoiceHubs,
    saveTempVoiceHub,
    deleteTempVoiceHub,
} from "./queries";
import { backendFetch } from "@/lib/backend";

const mockQuery = vi.hoisted(() =>
    vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows?: unknown[] }>>()
);

vi.mock("@/lib/db", () => ({
    db: {
        query: mockQuery,
    },
}));

vi.mock("@/lib/backend", () => ({
    backendFetch: vi.fn(),
}));

// Row mapping, SQL shape, tenant scoping, upsert conflict targets and
// constraints live in queries.integration.test.ts against a real database.
// What stays here is the behaviour a real database will not produce on
// demand: a schema rejection and the backend HTTP calls.

function okResponse(): Response {
    return new Response("", { status: 200 });
}

function errorResponse(body: string): Response {
    return new Response(body, { status: 500 });
}

describe("Temp Voice Query Module", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("getTempVoiceHubs", () => {
        it("should throw when a row fails validation", async () => {
            mockQuery.mockResolvedValue({ rows: [{ id: "hub_1" }] });

            await expect(getTempVoiceHubs("guild_123")).rejects.toThrow();
        });
    });

    describe("saveTempVoiceHub", () => {
        it("should throw when the returned row fails validation", async () => {
            mockQuery.mockResolvedValue({ rows: [{ id: "hub_1" }] });

            await expect(
                saveTempVoiceHub("guild_123", {
                    guild_id: "guild_123",
                    name: "Gaming",
                    hub_channel_id: "chan_1",
                    category_id: "cat_1",
                    default_channel_name: "{user.display_name}'s Lounge",
                })
            ).rejects.toThrow();
        });
    });

    describe("deleteTempVoiceHub", () => {
        it("should call the backend with the deleted category", async () => {
            mockQuery.mockResolvedValue({ rows: [{ category_id: "cat_1" }] });
            vi.mocked(backendFetch).mockResolvedValue(okResponse());

            await deleteTempVoiceHub("guild_123", "hub_1");

            expect(backendFetch).toHaveBeenCalledWith(
                "/api/guilds/guild_123/category/delete-entire",
                expect.objectContaining({ method: "DELETE" })
            );
            const [, init] = vi.mocked(backendFetch).mock.calls[0];
            expect(init?.headers).toEqual({ "Content-Type": "application/json" });
            expect(typeof init?.body === "string" ? JSON.parse(init.body) : null).toEqual({
                category_id: "cat_1",
            });
        });

        it("should skip the backend call when no row was deleted", async () => {
            mockQuery.mockResolvedValue({ rows: [] });

            await deleteTempVoiceHub("guild_123", "missing");

            expect(backendFetch).not.toHaveBeenCalled();
        });

        it("should throw with the backend error body", async () => {
            mockQuery.mockResolvedValue({ rows: [{ category_id: "cat_1" }] });
            vi.mocked(backendFetch).mockResolvedValue(errorResponse("category not found"));

            await expect(deleteTempVoiceHub("guild_123", "hub_1")).rejects.toThrow(
                "Failed to delete temp voice hub: category not found"
            );
        });
    });
});
