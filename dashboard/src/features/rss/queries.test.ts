import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { addFeedSubscription, getFeedSubscriptions, removeFeedSubscription } from "./queries";
import { backendFetch } from "@/lib/backend";

const mockQuery = vi.hoisted(() =>
    vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows?: unknown[]; rowCount?: number | null }>>()
);

vi.mock("@/lib/db", () => ({
    db: {
        query: mockQuery,
    },
}));

vi.mock("@/lib/backend", () => ({
    backendFetch: vi.fn(),
}));

// Row mapping, SQL shape, tenant scoping, ordering and constraints live in
// queries.integration.test.ts against a real database. What stays here is the
// behaviour a real database will not produce on demand: input validation that
// skips the query, a schema rejection, a null rowCount, and the backend HTTP
// calls.

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

describe("getFeedSubscriptions", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should reject an empty guild id without querying", async () => {
        await expect(getFeedSubscriptions("")).rejects.toThrow();
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it("should throw when a row fails validation", async () => {
        mockQuery.mockResolvedValue({ rows: [{ feedId: "not-a-uuid" }] });

        await expect(getFeedSubscriptions("guild_123")).rejects.toThrow();
    });
});

describe("removeFeedSubscription", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should return false when no row matched", async () => {
        mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

        await expect(
            removeFeedSubscription("guild_123", "6f9619ff-8b86-4111-b42d-00cf4fc964ff", "123")
        ).resolves.toBe(false);
    });

    it("should return false when the row count is null", async () => {
        mockQuery.mockResolvedValue({ rows: [], rowCount: null });

        await expect(
            removeFeedSubscription("guild_123", "6f9619ff-8b86-4111-b42d-00cf4fc964ff", "123")
        ).resolves.toBe(false);
    });
});

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

    it("should send the subscription fields as JSON", async () => {
        vi.mocked(backendFetch).mockResolvedValue(jsonResponse(okBody));

        await addFeedSubscription("guild_123", input);

        const [, init] = vi.mocked(backendFetch).mock.calls[0];
        expect(init?.headers).toEqual({ "Content-Type": "application/json" });
        expect(typeof init?.body === "string" ? JSON.parse(init.body) : null).toEqual({
            url: "https://example.com/feed.xml",
            channelId: "123456789012345678",
        });
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
