import { describe, it, expect } from "vitest";
import { rssFeedSubscriptionSchema, subscribeRssInputSchema } from "./types";

describe("RSS Schemas", () => {
    describe("subscribeRssInputSchema", () => {
        it("should PASS a valid http(s) feed URL with a channel", () => {
            const result = subscribeRssInputSchema.safeParse({
                url: "https://example.com/feed.xml",
                channelId: "123456789012345678",
            });

            expect(result.success).toBe(true);
        });

        it("should trim surrounding whitespace off the URL", () => {
            const result = subscribeRssInputSchema.safeParse({
                url: "   https://example.com/feed.xml   ",
                channelId: "123456789012345678",
            });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.url).toBe("https://example.com/feed.xml");
            }
        });

        it("should REJECT a URL that is not http(s)", () => {
            for (const url of ["ftp://example.com/feed", "example.com/feed.xml", "javascript:alert(1)"]) {
                const result = subscribeRssInputSchema.safeParse({ url, channelId: "123" });
                expect(result.success).toBe(false);
                if (!result.success) {
                    expect(result.error.issues[0].message).toBe(
                        "Feed URL must start with http:// or https://"
                    );
                }
            }
        });

        it("should REJECT an empty URL", () => {
            const result = subscribeRssInputSchema.safeParse({ url: "", channelId: "123" });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toBe("Please enter a feed URL");
            }
        });

        it("should REJECT a missing channel", () => {
            const result = subscribeRssInputSchema.safeParse({
                url: "https://example.com/feed.xml",
                channelId: "",
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toBe("Please select a channel");
            }
        });

        it("should REJECT a null channel — 'nothing picked yet' is null, not \"\"", () => {
            const result = subscribeRssInputSchema.safeParse({
                url: "https://example.com/feed.xml",
                channelId: null,
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toBe("Please select a channel");
                expect(result.error.issues[0].path).toEqual(["channelId"]);
            }
        });

        it("should REJECT an omitted channel", () => {
            const result = subscribeRssInputSchema.safeParse({
                url: "https://example.com/feed.xml",
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toBe("Please select a channel");
            }
        });

        it("should report the URL error first when both fields are empty", () => {
            // The client toasts `issues[0]`, so field order must stay URL-first.
            const result = subscribeRssInputSchema.safeParse({ url: "", channelId: null });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toBe("Please enter a feed URL");
            }
        });

        it("should narrow a valid channel to a required string on output", () => {
            const result = subscribeRssInputSchema.parse({
                url: "https://example.com/feed.xml",
                channelId: "123456789012345678",
            });

            expect(result.channelId).toBe("123456789012345678");
        });
    });

    describe("rssFeedSubscriptionSchema", () => {
        const row = {
            feedId: "6f9619ff-8b86-4111-b42d-00cf4fc964ff",
            url: "https://example.com/feed.xml",
            channelId: "123456789012345678",
            delivery: "PUBSUBHUBBUB",
            hubUrl: "https://pubsubhubbub.appspot.com",
            topic: "https://example.com/feed.xml",
            leaseExpiresAt: new Date("2026-09-27T10:00:00.000Z"),
            intervalSecs: null,
            lastPolledAt: null,
        };

        it("should PASS a polling row with null push fields", () => {
            const result = rssFeedSubscriptionSchema.parse({
                ...row,
                delivery: "POLLING",
                hubUrl: null,
                topic: null,
                leaseExpiresAt: null,
                intervalSecs: 600,
                lastPolledAt: new Date("2026-09-26T10:00:00.000Z"),
            });

            expect(result.delivery).toBe("POLLING");
            expect(result.intervalSecs).toBe(600);
        });

        it("should convert Postgres timestamps to ISO strings", () => {
            const result = rssFeedSubscriptionSchema.parse(row);

            expect(result.leaseExpiresAt).toBe("2026-09-27T10:00:00.000Z");
        });

        it("should tolerate null timestamps", () => {
            const result = rssFeedSubscriptionSchema.parse({ ...row, leaseExpiresAt: null });

            expect(result.leaseExpiresAt).toBeNull();
        });

        it("should REJECT an unknown delivery type", () => {
            const result = rssFeedSubscriptionSchema.safeParse({ ...row, delivery: "SMOKE_SIGNAL" });

            expect(result.success).toBe(false);
        });

        it("should REJECT a malformed feed id", () => {
            const result = rssFeedSubscriptionSchema.safeParse({ ...row, feedId: "not-a-uuid" });

            expect(result.success).toBe(false);
        });
    });
});
