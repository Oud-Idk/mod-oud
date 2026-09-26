import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { addFeedSubscription } from "./queries";
import { backendFetch } from "@/lib/backend";

vi.mock("@/lib/backend", () => ({
    backendFetch: vi.fn(),
}));

const input = {
    url: "https://example.com/feed.xml",
    channelId: "123456789012345678",
};

const okBody = {
    feedId: "6f9619ff-8b86-4111-b42d-00cf4fc964ff",
    feedTitle: "Example Feed",
    alreadySubscribed: false,
    delivery: "POLLING",
    hubConfirmed: false,
    intervalSecs: 600,
};

/// A real `Response` carrying an error status and body, so `.ok` and `.text()`
/// behave exactly as they do against the bot.
function errorResponse(status: number, body: string): Response {
    return new Response(body, { status });
}

function jsonResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
}

describe("addFeedSubscription", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should return the parsed body on success", async () => {
        vi.mocked(backendFetch).mockResolvedValue(jsonResponse(okBody));

        const result = await addFeedSubscription("guild_123", input);

        expect(backendFetch).toHaveBeenCalledWith(
            "/api/guilds/guild_123/rss/feeds",
            expect.objectContaining({ method: "POST" })
        );
        expect(result.feedTitle).toBe("Example Feed");
    });

    it("should surface a 4xx body verbatim — it is written for the user", async () => {
        vi.mocked(backendFetch).mockResolvedValue(
            errorResponse(400, "That URL does not look like a valid RSS or Atom feed.")
        );

        await expect(addFeedSubscription("guild_123", input)).rejects.toThrow(
            "That URL does not look like a valid RSS or Atom feed."
        );
    });

    it("should NOT echo a 5xx body back at the user", async () => {
        vi.mocked(backendFetch).mockResolvedValue(
            errorResponse(500, "connection pool timed out on primary")
        );

        await expect(addFeedSubscription("guild_123", input)).rejects.toThrow(
            "Something went wrong on our end. Please try again."
        );
    });

    it("should fall back to a readable message when a 4xx body is empty", async () => {
        vi.mocked(backendFetch).mockResolvedValue(errorResponse(400, "   "));

        await expect(addFeedSubscription("guild_123", input)).rejects.toThrow(
            "Could not subscribe to that feed."
        );
    });
});
