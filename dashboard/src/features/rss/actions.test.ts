import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { addFeedSubscriptionAction, removeFeedSubscriptionAction } from "./actions";
import { addFeedSubscription, removeFeedSubscription } from "./queries";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { revalidatePath } from "next/cache";

vi.mock("@/features/_shared/guild", () => ({
    verifyGuildAccess: vi.fn(),
}));

vi.mock("@/features/rss/queries", () => ({
    addFeedSubscription: vi.fn(),
    removeFeedSubscription: vi.fn(),
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

const validInput = {
    url: "https://example.com/feed.xml",
    channelId: "123456789012345678",
};

const websubResult = {
    feedId: "6f9619ff-8b86-4111-b42d-00cf4fc964ff",
    feedTitle: "Example Feed",
    alreadySubscribed: false,
    delivery: "PUBSUBHUBBUB",
    hubConfirmed: true,
    intervalSecs: null,
} as const;

describe("RSS Action Module", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const mockUser: Awaited<ReturnType<typeof verifyGuildAccess>> = {
        id: "user_123",
        name: "Test User",
    };

    // `rejects.toThrow` matches substrings, and a leaked ZodError message
    // contains the first issue text, so only an exact check separates a proper
    // `issues[0].message` rethrow from an unwrapped error.
    async function rejectionMessage(promise: Promise<unknown>): Promise<string> {
        try {
            await promise;
        } catch (error) {
            return error instanceof Error ? error.message : String(error);
        }
        throw new Error("Expected the promise to reject, but it resolved.");
    }

    describe("addFeedSubscriptionAction", () => {
        it("should verify access, call the bot, and revalidate the path", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(addFeedSubscription).mockResolvedValue(websubResult);

            const message = await addFeedSubscriptionAction("guild_123", validInput);

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(addFeedSubscription).toHaveBeenCalledWith("guild_123", validInput);
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/rss");
            expect(message).toBe('Subscribed to "Example Feed" via WebSub.');
        });

        it("should REJECT an invalid URL before touching the backend", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

            await expect(
                rejectionMessage(
                    addFeedSubscriptionAction("guild_123", { ...validInput, url: "not-a-url" })
                )
            ).resolves.toBe("Feed URL must start with http:// or https://");

            expect(addFeedSubscription).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should summarize an already-subscribed channel", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(addFeedSubscription).mockResolvedValue({
                ...websubResult,
                alreadySubscribed: true,
            });

            const message = await addFeedSubscriptionAction("guild_123", validInput);

            expect(message).toBe("This channel is already subscribed to that feed.");
        });

        it("should summarize polled feeds with their interval", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(addFeedSubscription).mockResolvedValue({
                ...websubResult,
                delivery: "POLLING",
                hubConfirmed: false,
                intervalSecs: 600,
            });

            const message = await addFeedSubscriptionAction("guild_123", validInput);

            expect(message).toBe('Subscribed to "Example Feed" — new posts are polled every 10 minutes.');
        });

        it("should warn when the WebSub hub is unconfirmed", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(addFeedSubscription).mockResolvedValue({
                ...websubResult,
                delivery: "PUBSUBHUBBUB",
                hubConfirmed: false,
            });

            const message = await addFeedSubscriptionAction("guild_123", validInput);

            expect(message).toContain("polling fallback may be required");
        });

        it("should throw the bot's error message verbatim", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(addFeedSubscription).mockRejectedValue(
                new Error("That URL does not look like a valid RSS or Atom feed.")
            );

            await expect(
                addFeedSubscriptionAction("guild_123", validInput)
            ).rejects.toThrow("That URL does not look like a valid RSS or Atom feed.");
        });

        it("should NOT revalidate when the bot call fails", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(addFeedSubscription).mockRejectedValue(new Error("bot down"));

            await expect(addFeedSubscriptionAction("guild_123", validInput)).rejects.toThrow(
                "bot down"
            );
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should throw the subscribe fallback on a non-Error rejection", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(addFeedSubscription).mockRejectedValue("kaboom");

            await expect(addFeedSubscriptionAction("guild_123", validInput)).rejects.toThrow(
                "Could not subscribe to that feed."
            );
        });

        it("should NOT call the bot when access is denied", async () => {
            vi.mocked(verifyGuildAccess).mockRejectedValue(new Error("Forbidden"));

            await expect(addFeedSubscriptionAction("guild_123", validInput)).rejects.toThrow(
                "Forbidden"
            );
            expect(addFeedSubscription).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });
    });

    describe("removeFeedSubscriptionAction", () => {
        it("should verify access, delete the row, and revalidate the path", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(removeFeedSubscription).mockResolvedValue(true);

            await removeFeedSubscriptionAction(
                "guild_123",
                "6f9619ff-8b86-4111-b42d-00cf4fc964ff",
                "123456789012345678"
            );

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(removeFeedSubscription).toHaveBeenCalledWith(
                "guild_123",
                "6f9619ff-8b86-4111-b42d-00cf4fc964ff",
                "123456789012345678"
            );
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/rss");
        });

        it("should throw when the subscription is already gone", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(removeFeedSubscription).mockResolvedValue(false);

            await expect(
                removeFeedSubscriptionAction(
                    "guild_123",
                    "6f9619ff-8b86-4111-b42d-00cf4fc964ff",
                    "123456789012345678"
                )
            ).rejects.toThrow("That subscription no longer exists.");
        });

        it("should REJECT a malformed feed id before touching the database", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

            await expect(
                rejectionMessage(
                    removeFeedSubscriptionAction("guild_123", "not-a-uuid", "123456789012345678")
                )
            ).resolves.toBe("Invalid feed ID");

            expect(removeFeedSubscription).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should REJECT an empty channel id before touching the database", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

            await expect(
                rejectionMessage(
                    removeFeedSubscriptionAction(
                        "guild_123",
                        "6f9619ff-8b86-4111-b42d-00cf4fc964ff",
                        ""
                    )
                )
            ).resolves.toBe("Invalid channel ID");

            expect(removeFeedSubscription).not.toHaveBeenCalled();
        });

        it("should throw the remove fallback on a non-Error rejection", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(removeFeedSubscription).mockRejectedValue("kaboom");

            await expect(
                removeFeedSubscriptionAction(
                    "guild_123",
                    "6f9619ff-8b86-4111-b42d-00cf4fc964ff",
                    "123456789012345678"
                )
            ).rejects.toThrow("Could not remove that subscription.");
        });

        it("should NOT delete when access is denied", async () => {
            vi.mocked(verifyGuildAccess).mockRejectedValue(new Error("Forbidden"));

            await expect(
                removeFeedSubscriptionAction(
                    "guild_123",
                    "6f9619ff-8b86-4111-b42d-00cf4fc964ff",
                    "123456789012345678"
                )
            ).rejects.toThrow("Forbidden");
            expect(removeFeedSubscription).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });
    });
});
