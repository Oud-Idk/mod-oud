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

function subscriptionRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        feedId: "6f9619ff-8b86-4111-b42d-00cf4fc964ff",
        url: "https://example.com/feed.xml",
        channelId: "123456789012345678",
        delivery: "POLLING",
        hubUrl: null,
        topic: null,
        leaseExpiresAt: null,
        intervalSecs: 600,
        lastPolledAt: null,
        ...overrides,
    };
}

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

    it("should return parsed subscriptions for the guild", async () => {
        mockQuery.mockResolvedValue({ rows: [subscriptionRow()] });

        const result = await getFeedSubscriptions("guild_123");

        expect(result).toHaveLength(1);
        expect(result[0].feedId).toBe("6f9619ff-8b86-4111-b42d-00cf4fc964ff");
        expect(mockQuery.mock.calls[0][1]).toEqual(["guild_123"]);
    });

    it("should query the subscription join in newest first order", async () => {
        mockQuery.mockResolvedValue({ rows: [] });

        await getFeedSubscriptions("guild_123");

        const sql = mockQuery.mock.calls[0][0];
        expect(sql).toContain("FROM channel_subscriptions");
        expect(sql).toContain("JOIN feeds");
        expect(sql).toContain("WHERE cs.guild_id = $1");
        expect(sql).toContain("ORDER BY cs.created_at DESC");
    });

    it("should return an empty array when the guild has no subscriptions", async () => {
        mockQuery.mockResolvedValue({ rows: [] });

        await expect(getFeedSubscriptions("guild_123")).resolves.toEqual([]);
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

    it("should delete the subscription row and return true", async () => {
        mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

        const removed = await removeFeedSubscription(
            "guild_123",
            "6f9619ff-8b86-4111-b42d-00cf4fc964ff",
            "123456789012345678"
        );

        expect(removed).toBe(true);
        expect(mockQuery.mock.calls[0][0]).toContain("DELETE FROM channel_subscriptions");
        expect(mockQuery.mock.calls[0][1]).toEqual([
            "6f9619ff-8b86-4111-b42d-00cf4fc964ff",
            "123456789012345678",
            "guild_123",
        ]);
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
